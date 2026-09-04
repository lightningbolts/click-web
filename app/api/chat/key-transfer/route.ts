import { NextRequest, NextResponse } from 'next/server';
import { parseE2eeV2Envelope } from '@/lib/chat/e2eeV2';
import { apiError } from '@/lib/api/errors';
import { parseBody } from '@/lib/api/parseBody';
import { chatKeyTransferApprovalBodySchema } from '@/lib/api/schemas/chat';
import {
  assertChatWritable,
  createChatGatekeeperAdmin,
  requireBearerUser,
} from '@/lib/server/chatGatekeeper';

const KEY_TRANSFER_ERROR = 'E2EE_V2_KEY_TRANSFER_FAILED';

function rpcStatus(error: unknown): number {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code)
    : '';
  return code === '42501' ? 403 : code === 'P0002' ? 404 : 400;
}

/** Approve one active existing device to receive its chat's historical key envelopes. */
export async function POST(request: NextRequest) {
  const auth = await requireBearerUser(request);
  if (!auth.ok) return auth.response;

  const parsed = await parseBody(request, chatKeyTransferApprovalBodySchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  try {
    const admin = createChatGatekeeperAdmin();
    const denied = await assertChatWritable(admin, auth.user.id, body.chat_id);
    if (denied) return denied;

    const historicalEnvelopes = body.historical_envelopes.map((entry) => {
      let envelope: ReturnType<typeof parseE2eeV2Envelope>;
      try {
        envelope = parseE2eeV2Envelope(entry.envelope);
      } catch {
        throw new Error('malformed historical envelope');
      }
      if (
        envelope.type !== 'epoch-key-wrap' ||
        envelope.chatId !== body.chat_id ||
        envelope.epoch !== entry.epoch ||
        entry.sender_device_id !== body.approving_device_id ||
        envelope.senderDeviceId !== body.approving_device_id ||
        envelope.recipientDeviceId !== body.recipient_device_id
      ) {
        throw new Error('historical envelope metadata mismatch');
      }
      return {
        epoch: entry.epoch,
        recipient_device_id: entry.recipient_device_id,
        sender_device_id: entry.sender_device_id,
        envelope: entry.envelope,
      };
    });

    const { data, error } = await admin.rpc('approve_chat_key_transfer', {
      p_chat_id: body.chat_id,
      p_actor_user_id: auth.user.id,
      p_approving_device_id: body.approving_device_id,
      p_recipient_device_id: body.recipient_device_id,
      p_historical_envelopes: historicalEnvelopes,
    });
    if (error) {
      console.error('[chat/key-transfer] approval RPC failed', { code: error.code, message: error.message });
      return apiError('E2EE v2 key transfer approval failed', rpcStatus(error), KEY_TRANSFER_ERROR);
    }

    return NextResponse.json({ approval: data }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && (error.message === 'malformed historical envelope' || error.message === 'historical envelope metadata mismatch')) {
      return apiError('Invalid E2EE v2 historical key transfer envelope', 400, KEY_TRANSFER_ERROR);
    }
    console.error('[chat/key-transfer] approval exception', error instanceof Error ? error.message : 'unknown');
    return apiError('E2EE v2 key transfer approval failed', 500, KEY_TRANSFER_ERROR);
  }
}
