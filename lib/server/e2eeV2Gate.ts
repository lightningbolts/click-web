import { type SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import {
  parseE2eeV2Envelope,
  type MediaAuthorizationEnvelope,
  type MessageEnvelope,
} from '@/lib/chat/e2eeV2';
import { apiError } from '@/lib/api/errors';

export const E2EE_V2_REQUIRED = 'E2EE_V2_REQUIRED';
export const E2EE_V2_NOT_READY = 'E2EE_V2_NOT_READY';
export const E2EE_V2_INVALID = 'E2EE_V2_INVALID';

const E2EE_V2_PREFIX = 'e2e2:';
const IDENTIFIER_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

type MessageGateRequest = {
  chatId: string;
  requestedChatId?: string;
  userId: string;
  content: unknown;
  epoch?: unknown;
  senderDeviceId?: unknown;
  clientMessageId?: unknown;
  allowLegacy?: boolean;
};

export type E2eeV2MessageGateResult = {
  ok: true;
  currentEpoch: number | null;
  envelope?: MessageEnvelope;
};

export type E2eeV2MediaGateResult = {
  ok: true;
  currentEpoch: number;
  envelope: MediaAuthorizationEnvelope;
};

type E2eeV2MediaMessageRequest = {
  chatId: string;
  userId: string;
  messageEnvelope: MessageEnvelope;
  metadata: Record<string, unknown>;
};

type GateFailure = { ok: false; response: NextResponse };

function invalid(message = 'Invalid E2EE v2 message envelope'): GateFailure {
  return { ok: false, response: apiError(message, 400, E2EE_V2_INVALID) };
}

export function e2eeV2RequiredResponse(): NextResponse {
  return apiError('E2EE v2 is required for this chat', 409, E2EE_V2_REQUIRED);
}

function readStrictIdentifier(value: unknown): string | null {
  return typeof value === 'string' && value.trim() === value && IDENTIFIER_RE.test(value)
    ? value
    : null;
}

function isV2Content(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(E2EE_V2_PREFIX);
}

function isStrictSha256Base64(value: unknown): value is string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9+/]{43}=$/.test(value)) return false;
  return true;
}

async function currentEpoch(admin: SupabaseClient, chatId: string): Promise<number | null> {
  const { data, error } = await admin
    .from('chat_key_epochs')
    .select('epoch')
    .eq('chat_id', chatId)
    .order('epoch', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data && Number.isSafeInteger(Number(data.epoch)) ? Number(data.epoch) : null;
}

/**
 * A v2 epoch is valid only for the device set it wrapped. Membership and device
 * changes therefore require a fresh epoch before the next write; otherwise a
 * newly added device could receive ciphertext it cannot decrypt.
 */
async function currentEpochCoversActiveChatDevices(
  admin: SupabaseClient,
  chatId: string,
  epoch: number,
): Promise<boolean> {
  const { data: memberData, error: memberError } = await admin.rpc('_e2ee_v2_chat_participants', {
    p_chat_id: chatId,
  });
  if (memberError) throw memberError;
  const memberIds = [...new Set(
    (Array.isArray(memberData) ? memberData : [])
      .map((value) => (typeof value === 'string' ? value.trim() : ''))
      .filter(Boolean),
  )];
  if (memberIds.length === 0) return false;

  const { data: devices, error: deviceError } = await admin
    .from('chat_devices')
    .select('id, user_id')
    .in('user_id', memberIds)
    .eq('key_algorithm', 'X25519')
    .eq('crypto_version', 2)
    .is('revoked_at', null);
  if (deviceError) throw deviceError;
  const activeDeviceIds = [...new Set(
    (devices ?? [])
      .map((row) => (typeof row.id === 'string' ? row.id : ''))
      .filter(Boolean),
  )].sort();
  const readyMemberIds = new Set(
    (devices ?? [])
      .map((row) => (typeof row.user_id === 'string' ? row.user_id : ''))
      .filter(Boolean),
  );
  if (memberIds.some((memberId) => !readyMemberIds.has(memberId))) return false;

  const { data: envelopes, error: envelopeError } = await admin
    .from('chat_recipient_key_envelopes')
    .select('recipient_device_id')
    .eq('chat_id', chatId)
    .eq('epoch', epoch);
  if (envelopeError) throw envelopeError;
  const wrappedDeviceIds = [...new Set(
    (envelopes ?? [])
      .map((row) => (typeof row.recipient_device_id === 'string' ? row.recipient_device_id : ''))
      .filter(Boolean),
  )].sort();
  return activeDeviceIds.length === wrappedDeviceIds.length &&
    activeDeviceIds.every((deviceId, index) => deviceId === wrappedDeviceIds[index]);
}

/**
 * Enforces the server-side E2EE v2 write boundary. This function never decrypts or logs an
 * envelope; it only parses authenticated metadata, checks the active epoch, and verifies the
 * caller-owned active device row before the caller inserts a message.
 */
export async function assertE2eeV2MessageWrite(
  admin: SupabaseClient,
  request: MessageGateRequest,
): Promise<E2eeV2MessageGateResult | GateFailure> {
  const chatId = request.chatId.trim();
  const requestedChatId = request.requestedChatId?.trim();
  const contentIsV2 = isV2Content(request.content);
  const epoch = await currentEpoch(admin, chatId);

  if (!contentIsV2) {
    // Once an epoch exists, every client-authored message must use v2. The
    // allowLegacy field is retained for request compatibility, but it cannot
    // create a downgrade path for special message types.
    if (epoch !== null) return { ok: false, response: e2eeV2RequiredResponse() };
    return { ok: true, currentEpoch: epoch };
  }

  if (epoch === null) {
    return {
      ok: false,
      response: apiError('Chat has no initialized E2EE v2 epoch', 409, E2EE_V2_NOT_READY),
    };
  }

  const senderDeviceId = readStrictIdentifier(request.senderDeviceId);
  const clientMessageId = readStrictIdentifier(request.clientMessageId);
  if (!senderDeviceId || !clientMessageId || !Number.isSafeInteger(request.epoch) || Number(request.epoch) <= 0) {
    return invalid('E2EE v2 message metadata is required');
  }
  if (requestedChatId && requestedChatId !== chatId) return invalid('E2EE v2 chatId does not match the request');

  let envelope: MessageEnvelope;
  try {
    const parsed = parseE2eeV2Envelope(request.content as string);
    if (parsed.type !== 'message') return invalid('E2EE v2 message envelope type is invalid');
    envelope = parsed;
  } catch {
    return invalid();
  }

  if (
    envelope.chatId !== chatId ||
    envelope.epoch !== request.epoch ||
    envelope.epoch !== epoch ||
    envelope.senderDeviceId !== senderDeviceId ||
    envelope.clientMessageId !== clientMessageId
  ) {
    return invalid('E2EE v2 authenticated metadata does not match the request');
  }

  if (!(await currentEpochCoversActiveChatDevices(admin, chatId, epoch))) {
    return { ok: false, response: e2eeV2RequiredResponse() };
  }

  const { data: device, error: deviceError } = await admin
    .from('chat_devices')
    .select('id, user_id, device_id, key_algorithm, crypto_version, revoked_at')
    .eq('user_id', request.userId)
    .eq('device_id', senderDeviceId)
    .eq('key_algorithm', 'X25519')
    .eq('crypto_version', 2)
    .is('revoked_at', null)
    .maybeSingle();
  if (deviceError) throw deviceError;
  if (!device) return invalid('E2EE v2 sender device is not active for this user');

  return { ok: true, currentEpoch: epoch, envelope };
}

type MediaGateRequest = {
  chatId: string;
  userId: string;
  content: unknown;
  mediaCiphertextSha256?: unknown;
};

/**
 * Binds uploaded opaque media bytes to an authenticated v2 authorization envelope. The server
 * never decrypts the bytes; it only checks the envelope metadata, active sender device, epoch,
 * and the digest that it computes over the exact uploaded ciphertext.
 */
export async function assertE2eeV2MediaUpload(
  admin: SupabaseClient,
  request: MediaGateRequest,
): Promise<E2eeV2MediaGateResult | GateFailure | { ok: true; currentEpoch: null; envelope?: undefined }> {
  const chatId = request.chatId.trim();
  const epoch = await currentEpoch(admin, chatId);
  const content = typeof request.content === 'string' ? request.content : '';
  if (!content.startsWith(E2EE_V2_PREFIX)) {
    if (epoch !== null) return { ok: false, response: e2eeV2RequiredResponse() };
    return { ok: true, currentEpoch: null };
  }
  if (epoch === null) {
    return { ok: false, response: apiError('Chat has no initialized E2EE v2 epoch', 409, E2EE_V2_NOT_READY) };
  }
  if (!isStrictSha256Base64(request.mediaCiphertextSha256)) {
    return invalid('E2EE v2 media ciphertext digest is required');
  }

  let envelope: MediaAuthorizationEnvelope;
  try {
    const parsed = parseE2eeV2Envelope(content);
    if (parsed.type !== 'media') return invalid('E2EE v2 media authorization envelope type is invalid');
    envelope = parsed;
  } catch {
    return invalid('Invalid E2EE v2 media authorization envelope');
  }

  if (envelope.chatId !== chatId || envelope.epoch !== epoch || envelope.mediaCiphertextSha256 !== request.mediaCiphertextSha256) {
    return invalid('E2EE v2 media authorization metadata does not match the request');
  }

  if (!(await currentEpochCoversActiveChatDevices(admin, chatId, epoch))) {
    return { ok: false, response: e2eeV2RequiredResponse() };
  }

  const { data: device, error: deviceError } = await admin
    .from('chat_devices')
    .select('id')
    .eq('user_id', request.userId)
    .eq('device_id', envelope.senderDeviceId)
    .eq('key_algorithm', 'X25519')
    .eq('crypto_version', 2)
    .is('revoked_at', null)
    .maybeSingle();
  if (deviceError) throw deviceError;
  if (!device) return invalid('E2EE v2 sender device is not active for this user');
  return { ok: true, currentEpoch: epoch, envelope };
}

/** Ensure a v2 media/file message references the same opaque upload authorization as its body. */
export function assertE2eeV2MediaMessageWrite(
  request: E2eeV2MediaMessageRequest,
): { ok: true } | GateFailure {
  const pathValue = request.metadata.media_path ?? request.metadata.attachment_path;
  const digest = request.metadata.media_ciphertext_sha256;
  const authorization = request.metadata.media_authorization_envelope;
  if (
    typeof pathValue !== 'string' ||
    !pathValue ||
    pathValue.startsWith('/') ||
    pathValue.includes('..') ||
    !pathValue.startsWith(`${request.chatId}/${request.userId}/`) ||
    !isStrictSha256Base64(digest) ||
    typeof authorization !== 'string'
  ) {
    return invalid('E2EE v2 media message metadata is required');
  }
  try {
    const media = parseE2eeV2Envelope(authorization);
    if (
      media.type !== 'media' ||
      media.chatId !== request.messageEnvelope.chatId ||
      media.epoch !== request.messageEnvelope.epoch ||
      media.senderDeviceId !== request.messageEnvelope.senderDeviceId ||
      media.clientMessageId !== request.messageEnvelope.clientMessageId ||
      media.mediaCiphertextSha256 !== digest
    ) {
      return invalid('E2EE v2 media message authorization does not match the message');
    }
  } catch {
    return invalid('Invalid E2EE v2 media message authorization');
  }
  return { ok: true };
}

export function messageBodyV2Field(
  body: Record<string, unknown>,
  snake: string,
  camel: string,
  metadata?: Record<string, unknown>,
): unknown {
  const direct = body[snake] ?? body[camel];
  if (direct !== undefined) return direct;
  return metadata?.[snake] ?? metadata?.[camel];
}
