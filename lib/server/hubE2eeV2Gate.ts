import { type SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import {
  parseE2eeV2Envelope,
  type MediaAuthorizationEnvelope,
  type MessageEnvelope,
} from '@/lib/chat/e2eeV2';
import { apiError } from '@/lib/api/errors';

export const HUB_E2EE_V2_REQUIRED = 'HUB_E2EE_V2_REQUIRED';
export const HUB_E2EE_V2_NOT_READY = 'HUB_E2EE_V2_NOT_READY';
export const HUB_E2EE_V2_INVALID = 'HUB_E2EE_V2_INVALID';

const E2EE_V2_PREFIX = 'e2e2:';
const IDENTIFIER_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export type HubMessageGateRequest = {
  hubId: string;
  userId: string;
  content: unknown;
  epoch?: unknown;
  senderDeviceId?: unknown;
  clientMessageId?: unknown;
  allowLegacy?: boolean;
};

export type HubE2eeV2MessageGateResult = {
  ok: true;
  currentEpoch: number | null;
  envelope?: MessageEnvelope;
};

export type HubMediaUploadGateRequest = {
  hubId: string;
  userId: string;
  content: unknown;
  mediaCiphertextSha256?: unknown;
  epoch?: unknown;
  senderDeviceId?: unknown;
  clientMessageId?: unknown;
};

export type HubE2eeV2MediaGateResult = {
  ok: true;
  currentEpoch: number | null;
  envelope?: MediaAuthorizationEnvelope;
};

export type HubE2eeV2MediaMessageRequest = {
  hubId: string;
  userId: string;
  messageEnvelope: MessageEnvelope;
  metadata: Record<string, unknown>;
};

type GateFailure = { ok: false; response: NextResponse };

function invalid(message = 'Invalid hub E2EE v2 message envelope'): GateFailure {
  return { ok: false, response: apiError(message, 400, HUB_E2EE_V2_INVALID) };
}

export function hubE2eeV2RequiredResponse(): NextResponse {
  return apiError('E2EE v2 is required for this hub', 409, HUB_E2EE_V2_REQUIRED);
}

function readStrictIdentifier(value: unknown): string | null {
  return typeof value === 'string' && value.trim() === value && IDENTIFIER_RE.test(value)
    ? value
    : null;
}

function isStrictSha256Base64(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9+/]{43}=$/.test(value);
}

async function currentHubEpoch(admin: SupabaseClient, hubId: string): Promise<number | null> {
  const { data, error } = await admin
    .from('hub_key_epochs')
    .select('epoch')
    .eq('hub_id', hubId)
    .order('epoch', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data && Number.isSafeInteger(Number(data.epoch)) ? Number(data.epoch) : null;
}

async function currentHubEpochCoversActiveDevices(
  admin: SupabaseClient,
  hubId: string,
  epoch: number,
  participantIds: string[],
): Promise<boolean> {
  const { data: devices, error: deviceError } = await admin
    .from('chat_devices')
    .select('id, user_id')
    .in('user_id', participantIds)
    .eq('key_algorithm', 'X25519')
    .eq('crypto_version', 2)
    .is('revoked_at', null);
  if (deviceError) throw deviceError;
  const activeDeviceIds = [...new Set(
    (devices ?? [])
      .map((row) => (typeof row.id === 'string' ? row.id : ''))
      .filter(Boolean),
  )].sort();
  const readyUsers = new Set(
    (devices ?? [])
      .map((row) => (typeof row.user_id === 'string' ? row.user_id : ''))
      .filter(Boolean),
  );
  if (participantIds.some((participantId) => !readyUsers.has(participantId))) return false;

  const { data: envelopes, error: envelopeError } = await admin
    .from('hub_recipient_key_envelopes')
    .select('recipient_device_id')
    .eq('hub_id', hubId)
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
 * Enforces the hub E2EE v2 write boundary without decrypting or logging ciphertext. Legacy
 * content remains writable until the hub has its first epoch; reads are intentionally unchanged.
 */
export async function assertHubE2eeV2MessageWrite(
  admin: SupabaseClient,
  request: HubMessageGateRequest,
): Promise<HubE2eeV2MessageGateResult | GateFailure> {
  const hubId = request.hubId.trim();
  const contentIsV2 = typeof request.content === 'string' && request.content.startsWith(E2EE_V2_PREFIX);
  const epoch = await currentHubEpoch(admin, hubId);

  if (!contentIsV2) {
    if (epoch !== null && !request.allowLegacy) return { ok: false, response: hubE2eeV2RequiredResponse() };
    return { ok: true, currentEpoch: epoch };
  }

  if (epoch === null) {
    return {
      ok: false,
      response: apiError('Hub has no initialized E2EE v2 epoch', 409, HUB_E2EE_V2_NOT_READY),
    };
  }

  const senderDeviceId = readStrictIdentifier(request.senderDeviceId);
  const clientMessageId = readStrictIdentifier(request.clientMessageId);
  if (!senderDeviceId || !clientMessageId || !Number.isSafeInteger(request.epoch) || Number(request.epoch) <= 0) {
    return invalid('Hub E2EE v2 message metadata is required');
  }

  let envelope: MessageEnvelope;
  try {
    const parsed = parseE2eeV2Envelope(request.content as string);
    if (parsed.type !== 'message') return invalid('Hub E2EE v2 message envelope type is invalid');
    envelope = parsed;
  } catch {
    return invalid();
  }

  if (
    envelope.chatId !== hubId ||
    envelope.epoch !== request.epoch ||
    envelope.epoch !== epoch ||
    envelope.senderDeviceId !== senderDeviceId ||
    envelope.clientMessageId !== clientMessageId
  ) {
    return invalid('Hub E2EE v2 authenticated metadata does not match the request');
  }

  const { data: participant, error: participantError } = await admin
    .from('hub_participants')
    .select('user_id')
    .eq('hub_id', hubId)
    .eq('user_id', request.userId)
    .maybeSingle();
  if (participantError) throw participantError;
  if (!participant) {
    return { ok: false, response: apiError('Hub E2EE v2 sender is not an active participant', 403, HUB_E2EE_V2_INVALID) };
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
  if (!device) {
    return { ok: false, response: apiError('Hub E2EE v2 sender device is not active for this user', 403, HUB_E2EE_V2_INVALID) };
  }

  const { data: participants, error: participantListError } = await admin
    .from('hub_participants')
    .select('user_id')
    .eq('hub_id', hubId);
  if (participantListError) throw participantListError;
  const participantIds = [...new Set(
    (participants ?? [])
      .map((row) => (typeof row.user_id === 'string' ? row.user_id.trim() : ''))
      .filter(Boolean),
  )];
  if (participantIds.length === 0) {
    return { ok: false, response: apiError('Hub E2EE v2 participants are not ready', 409, HUB_E2EE_V2_NOT_READY) };
  }
  const { data: participantDevices, error: participantDeviceError } = await admin
    .from('chat_devices')
    .select('user_id')
    .in('user_id', participantIds)
    .eq('key_algorithm', 'X25519')
    .eq('crypto_version', 2)
    .is('revoked_at', null);
  if (participantDeviceError) throw participantDeviceError;
  const readyUsers = new Set(
    (participantDevices ?? [])
      .map((row) => (typeof row.user_id === 'string' ? row.user_id.trim() : ''))
      .filter(Boolean),
  );
  if (participantIds.some((participantId) => !readyUsers.has(participantId))) {
    return { ok: false, response: apiError('All active hub participants need E2EE v2 devices', 409, HUB_E2EE_V2_NOT_READY) };
  }
  if (!(await currentHubEpochCoversActiveDevices(admin, hubId, epoch, participantIds))) {
    return { ok: false, response: hubE2eeV2RequiredResponse() };
  }

  return { ok: true, currentEpoch: epoch, envelope };
}

/**
 * Enforces the hub E2EE v2 media-upload boundary. The route separately hashes the exact uploaded
 * ciphertext bytes and compares that digest with the accepted envelope before storage.
 */
export async function assertHubE2eeV2MediaUpload(
  admin: SupabaseClient,
  request: HubMediaUploadGateRequest,
): Promise<HubE2eeV2MediaGateResult | GateFailure> {
  const hubId = request.hubId.trim();
  const content = typeof request.content === 'string' ? request.content : '';
  const epoch = await currentHubEpoch(admin, hubId);

  if (!content.startsWith(E2EE_V2_PREFIX)) {
    if (epoch !== null) return { ok: false, response: hubE2eeV2RequiredResponse() };
    return { ok: true, currentEpoch: null };
  }
  if (epoch === null) {
    return {
      ok: false,
      response: apiError('Hub has no initialized E2EE v2 epoch', 409, HUB_E2EE_V2_NOT_READY),
    };
  }

  const senderDeviceId = readStrictIdentifier(request.senderDeviceId);
  const clientMessageId = readStrictIdentifier(request.clientMessageId);
  if (
    !senderDeviceId ||
    !clientMessageId ||
    !Number.isSafeInteger(request.epoch) ||
    Number(request.epoch) <= 0 ||
    !isStrictSha256Base64(request.mediaCiphertextSha256)
  ) {
    return invalid('Hub E2EE v2 media metadata is required');
  }

  let envelope: MediaAuthorizationEnvelope;
  try {
    const parsed = parseE2eeV2Envelope(content);
    if (parsed.type !== 'media') return invalid('Hub E2EE v2 media authorization envelope type is invalid');
    envelope = parsed;
  } catch {
    return invalid('Invalid hub E2EE v2 media authorization envelope');
  }

  if (
    envelope.chatId !== hubId ||
    envelope.epoch !== request.epoch ||
    envelope.epoch !== epoch ||
    envelope.senderDeviceId !== senderDeviceId ||
    envelope.clientMessageId !== clientMessageId ||
    envelope.mediaCiphertextSha256 !== request.mediaCiphertextSha256
  ) {
    return invalid('Hub E2EE v2 media authorization metadata does not match the request');
  }

  const { data: participant, error: participantError } = await admin
    .from('hub_participants')
    .select('user_id')
    .eq('hub_id', hubId)
    .eq('user_id', request.userId)
    .maybeSingle();
  if (participantError) throw participantError;
  if (!participant) {
    return { ok: false, response: apiError('Hub E2EE v2 sender is not an active participant', 403, HUB_E2EE_V2_INVALID) };
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
  if (!device) {
    return { ok: false, response: apiError('Hub E2EE v2 sender device is not active for this user', 403, HUB_E2EE_V2_INVALID) };
  }

  const { data: participants, error: participantListError } = await admin
    .from('hub_participants')
    .select('user_id')
    .eq('hub_id', hubId);
  if (participantListError) throw participantListError;
  const participantIds = [...new Set(
    (participants ?? [])
      .map((row) => (typeof row.user_id === 'string' ? row.user_id.trim() : ''))
      .filter(Boolean),
  )];
  if (participantIds.length === 0) {
    return { ok: false, response: apiError('Hub E2EE v2 participants are not ready', 409, HUB_E2EE_V2_NOT_READY) };
  }
  const { data: participantDevices, error: participantDeviceError } = await admin
    .from('chat_devices')
    .select('user_id')
    .in('user_id', participantIds)
    .eq('key_algorithm', 'X25519')
    .eq('crypto_version', 2)
    .is('revoked_at', null);
  if (participantDeviceError) throw participantDeviceError;
  const readyUsers = new Set(
    (participantDevices ?? [])
      .map((row) => (typeof row.user_id === 'string' ? row.user_id.trim() : ''))
      .filter(Boolean),
  );
  if (participantIds.some((participantId) => !readyUsers.has(participantId))) {
    return { ok: false, response: apiError('All active hub participants need E2EE v2 devices', 409, HUB_E2EE_V2_NOT_READY) };
  }
  if (!(await currentHubEpochCoversActiveDevices(admin, hubId, epoch, participantIds))) {
    return { ok: false, response: hubE2eeV2RequiredResponse() };
  }

  return { ok: true, currentEpoch: epoch, envelope };
}

/** Bind hub image/audio metadata to the exact authenticated message and media authorization envelope. */
export function assertHubE2eeV2MediaMessageWrite(
  request: HubE2eeV2MediaMessageRequest,
): { ok: true } | GateFailure {
  const pathValue = request.metadata.media_path ?? request.metadata.mediaPath;
  const digest = request.metadata.media_ciphertext_sha256 ?? request.metadata.mediaCiphertextSha256;
  const authorization =
    request.metadata.media_authorization_envelope ?? request.metadata.mediaAuthorizationEnvelope;
  const mediaChatId = request.metadata.media_chat_id ?? request.metadata.mediaChatId;
  const mediaEpoch =
    request.metadata.epoch ?? request.metadata.media_epoch ?? request.metadata.mediaEpoch;
  const mediaSenderDeviceId =
    request.metadata.sender_device_id ??
    request.metadata.senderDeviceId ??
    request.metadata.media_sender_device_id ??
    request.metadata.mediaSenderDeviceId;
  const mediaClientMessageId =
    request.metadata.client_message_id ??
    request.metadata.clientMessageId ??
    request.metadata.media_client_message_id ??
    request.metadata.mediaClientMessageId;
  const pathSegments = typeof pathValue === 'string' ? pathValue.split('/') : [];
  if (
    typeof pathValue !== 'string' ||
    !pathValue ||
    pathValue.trim() !== pathValue ||
    pathValue.startsWith('/') ||
    pathValue.includes('..') ||
    pathSegments.length < 4 ||
    pathSegments.some((segment) => !segment.trim()) ||
    !pathValue.startsWith(`${request.userId}/hub/${request.hubId}/`) ||
    (mediaChatId !== undefined && mediaChatId !== request.hubId) ||
    mediaEpoch !== request.messageEnvelope.epoch ||
    mediaSenderDeviceId !== request.messageEnvelope.senderDeviceId ||
    mediaClientMessageId !== request.messageEnvelope.clientMessageId ||
    !isStrictSha256Base64(digest) ||
    typeof authorization !== 'string'
  ) {
    return invalid('Hub E2EE v2 media message metadata is required');
  }

  try {
    const parsed = parseE2eeV2Envelope(authorization);
    if (
      parsed.type !== 'media' ||
      parsed.chatId !== request.messageEnvelope.chatId ||
      parsed.epoch !== request.messageEnvelope.epoch ||
      parsed.senderDeviceId !== request.messageEnvelope.senderDeviceId ||
      parsed.clientMessageId !== request.messageEnvelope.clientMessageId ||
      parsed.mediaCiphertextSha256 !== digest
    ) {
      return invalid('Hub E2EE v2 media message authorization does not match the message');
    }
    const messageDigest = (request.messageEnvelope as MessageEnvelope & { mediaCiphertextSha256?: unknown })
      .mediaCiphertextSha256;
    if (messageDigest !== undefined && messageDigest !== digest) {
      return invalid('Hub E2EE v2 media digest does not match the message');
    }
  } catch {
    return invalid('Invalid hub E2EE v2 media message authorization');
  }
  return { ok: true };
}
