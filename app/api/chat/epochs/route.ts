import { NextRequest, NextResponse } from 'next/server';
import { parseE2eeV2Envelope } from '@/lib/chat/e2eeV2';
import { parseBody } from '@/lib/api/parseBody';
import { apiError } from '@/lib/api/errors';
import { chatEpochLifecycleBodySchema } from '@/lib/api/schemas/chat';
import {
  assertChatWritable,
  createChatGatekeeperAdmin,
  requireBearerUser,
} from '@/lib/server/chatGatekeeper';

const INVALID_EPOCH_REQUEST = 'E2EE_V2_INVALID';

type EpochEnvelopeResponse = {
  chat_id: string;
  device_id: string;
  current_epoch: number | null;
  membership_fingerprint: string | null;
  envelopes: unknown[];
};

function invalidEpochRequest(): NextResponse {
  return apiError('Invalid E2EE v2 epoch request', 400, INVALID_EPOCH_REQUEST);
}

function errorStatus(error: unknown): number {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code)
    : '';
  if (code === '42501') return 403;
  if (code === '23505') return 409;
  if (code === 'P0002') return 404;
  return 400;
}

export async function POST(request: NextRequest) {
  const auth = await requireBearerUser(request);
  if (!auth.ok) return auth.response;

  const parsed = await parseBody(request, chatEpochLifecycleBodySchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  try {
    const admin = createChatGatekeeperAdmin();
    const denied = await assertChatWritable(admin, auth.user.id, body.chat_id);
    if (denied) return denied;

    const envelopeRows = body.envelopes.map((entry) => {
      let parsedEnvelope: ReturnType<typeof parseE2eeV2Envelope>;
      try {
        parsedEnvelope = parseE2eeV2Envelope(entry.envelope);
      } catch {
        throw new Error('malformed envelope');
      }
      if (
        parsedEnvelope.type !== 'epoch-key-wrap' ||
        parsedEnvelope.chatId !== body.chat_id ||
        parsedEnvelope.epoch !== body.epoch ||
        parsedEnvelope.senderDeviceId !== body.sender_device_id ||
        parsedEnvelope.recipientDeviceId !== entry.recipient_device_id
      ) {
        throw new Error('envelope metadata mismatch');
      }
      return {
        recipient_device_id: entry.recipient_device_id,
        sender_device_id: body.sender_device_id,
        envelope: entry.envelope,
      };
    });

    const { data, error } = await admin.rpc('create_or_rotate_chat_epoch', {
      p_chat_id: body.chat_id,
      p_actor_user_id: auth.user.id,
      p_sender_device_id: body.sender_device_id,
      p_epoch: body.epoch,
      p_membership_fingerprint: body.membership_fingerprint,
      p_envelopes: envelopeRows,
    });
    if (error) {
      console.error('[chat/epochs] lifecycle RPC failed', { code: error.code, message: error.message });
      return apiError('E2EE v2 epoch operation failed', errorStatus(error), INVALID_EPOCH_REQUEST);
    }

    return NextResponse.json({ epoch: data }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && (error.message === 'malformed envelope' || error.message === 'envelope metadata mismatch')) {
      return invalidEpochRequest();
    }
    console.error('[chat/epochs] lifecycle exception', error instanceof Error ? error.message : 'unknown');
    return apiError('E2EE v2 epoch operation failed', 500, INVALID_EPOCH_REQUEST);
  }
}

export async function GET(request: NextRequest) {
  const auth = await requireBearerUser(request);
  if (!auth.ok) return auth.response;

  const chatId = (
    request.nextUrl.searchParams.get('chat_id') ?? request.nextUrl.searchParams.get('chatId') ?? ''
  ).trim();
  const deviceId = (
    request.nextUrl.searchParams.get('device_id') ?? request.nextUrl.searchParams.get('deviceId') ?? ''
  ).trim();
  if (!chatId) return NextResponse.json({ error: 'chat_id is required' }, { status: 400 });
  if (!deviceId) return NextResponse.json({ error: 'device_id is required' }, { status: 400 });

  try {
    const admin = createChatGatekeeperAdmin();
    const denied = await assertChatWritable(admin, auth.user.id, chatId);
    if (denied) return denied;

    const { data, error } = await admin.rpc('get_chat_key_envelopes_for_device', {
      p_chat_id: chatId,
      p_user_id: auth.user.id,
      p_device_id: deviceId,
    });
    if (error) {
      console.error('[chat/epochs] envelope retrieval failed', { code: error.code, message: error.message });
      return apiError('E2EE v2 key retrieval failed', 500, INVALID_EPOCH_REQUEST);
    }

    const { data: epochRow, error: epochError } = await admin
      .from('chat_key_epochs')
      .select('epoch, membership_fingerprint')
      .eq('chat_id', chatId)
      .order('epoch', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (epochError) {
      console.error('[chat/epochs] current epoch lookup failed', { code: epochError.code, message: epochError.message });
      return apiError('E2EE v2 key retrieval failed', 500, INVALID_EPOCH_REQUEST);
    }

    const response: EpochEnvelopeResponse = {
      chat_id: chatId,
      device_id: deviceId,
      current_epoch: epochRow?.epoch == null ? null : Number(epochRow.epoch),
      membership_fingerprint:
        typeof epochRow?.membership_fingerprint === 'string' ? epochRow.membership_fingerprint : null,
      envelopes: (data ?? []) as unknown[],
    };
    return NextResponse.json(response);
  } catch (error) {
    console.error('[chat/epochs] retrieval exception', error instanceof Error ? error.message : 'unknown');
    return apiError('E2EE v2 key retrieval failed', 500, INVALID_EPOCH_REQUEST);
  }
}
