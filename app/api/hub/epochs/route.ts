import { NextRequest, NextResponse } from 'next/server';
import { parseE2eeV2Envelope } from '@/lib/chat/e2eeV2';
import { parseBody } from '@/lib/api/parseBody';
import { apiError } from '@/lib/api/errors';
import { hubEpochLifecycleBodySchema, hubE2eeIdentifier } from '@/lib/api/schemas/hubE2ee';
import { assertHubReadable } from '@/lib/server/hubGatekeeper';
import { createChatGatekeeperAdmin, requireBearerUser } from '@/lib/server/chatGatekeeper';

const HUB_E2EE_V2_ERROR = 'HUB_E2EE_V2_INVALID';

function errorStatus(error: unknown): number {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code)
    : '';
  if (code === '42501') return 403;
  if (code === '23505') return 409;
  if (code === 'P0002') return 404;
  return 400;
}

function invalidEpochRequest(): NextResponse {
  return apiError('Invalid hub E2EE v2 epoch request', 400, HUB_E2EE_V2_ERROR);
}

export async function POST(request: NextRequest) {
  const auth = await requireBearerUser(request);
  if (!auth.ok) return auth.response;

  const parsed = await parseBody(request, hubEpochLifecycleBodySchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  try {
    const admin = createChatGatekeeperAdmin();
    const denied = await assertHubReadable(admin, body.hub_id, auth.user.id);
    if (denied) return denied;

    const envelopeRows = body.envelopes.map((entry) => {
      let envelope: ReturnType<typeof parseE2eeV2Envelope>;
      try {
        envelope = parseE2eeV2Envelope(entry.envelope);
      } catch {
        throw new Error('malformed envelope');
      }
      if (
        envelope.type !== 'epoch-key-wrap' ||
        envelope.chatId !== body.hub_id ||
        envelope.epoch !== body.epoch ||
        envelope.senderDeviceId !== body.sender_device_id ||
        envelope.recipientDeviceId !== entry.recipient_device_id
      ) {
        throw new Error('envelope metadata mismatch');
      }
      return {
        recipient_device_id: entry.recipient_device_id,
        sender_device_id: body.sender_device_id,
        envelope: entry.envelope,
      };
    });

    const { data, error } = await admin.rpc('create_or_rotate_hub_epoch', {
      p_hub_id: body.hub_id,
      p_actor_user_id: auth.user.id,
      p_sender_device_id: body.sender_device_id,
      p_epoch: body.epoch,
      p_membership_fingerprint: body.membership_fingerprint,
      p_envelopes: envelopeRows,
    });
    if (error) {
      console.error('[hub/epochs] lifecycle RPC failed', { code: error.code, message: error.message });
      return apiError('Hub E2EE v2 epoch operation failed', errorStatus(error), HUB_E2EE_V2_ERROR);
    }

    return NextResponse.json({ epoch: data }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && (error.message === 'malformed envelope' || error.message === 'envelope metadata mismatch')) {
      return invalidEpochRequest();
    }
    console.error('[hub/epochs] lifecycle exception', error instanceof Error ? error.message : 'unknown');
    return apiError('Hub E2EE v2 epoch operation failed', 500, HUB_E2EE_V2_ERROR);
  }
}

export async function GET(request: NextRequest) {
  const auth = await requireBearerUser(request);
  if (!auth.ok) return auth.response;

  const hubId = (
    request.nextUrl.searchParams.get('hub_id') ?? request.nextUrl.searchParams.get('hubId') ?? ''
  ).trim();
  const deviceId = (
    request.nextUrl.searchParams.get('device_id') ?? request.nextUrl.searchParams.get('deviceId') ?? ''
  ).trim();
  if (!hubId) return NextResponse.json({ error: 'hub_id is required' }, { status: 400 });
  if (!hubE2eeIdentifier.safeParse(deviceId).success) {
    return NextResponse.json({ error: 'device_id is required' }, { status: 400 });
  }

  try {
    const admin = createChatGatekeeperAdmin();
    const denied = await assertHubReadable(admin, hubId, auth.user.id);
    if (denied) return denied;

    const { data, error } = await admin.rpc('get_hub_key_envelopes_for_device', {
      p_hub_id: hubId,
      p_user_id: auth.user.id,
      p_device_id: deviceId,
    });
    if (error) {
      console.error('[hub/epochs] envelope retrieval failed', { code: error.code, message: error.message });
      return apiError('Hub E2EE v2 key retrieval failed', 500, HUB_E2EE_V2_ERROR);
    }

    const { data: epochRow, error: epochError } = await admin
      .from('hub_key_epochs')
      .select('epoch, membership_fingerprint')
      .eq('hub_id', hubId)
      .order('epoch', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (epochError) {
      console.error('[hub/epochs] current epoch lookup failed', { code: epochError.code, message: epochError.message });
      return apiError('Hub E2EE v2 key retrieval failed', 500, HUB_E2EE_V2_ERROR);
    }

    return NextResponse.json({
      hub_id: hubId,
      device_id: deviceId,
      current_epoch: epochRow?.epoch == null ? null : Number(epochRow.epoch),
      membership_fingerprint:
        typeof epochRow?.membership_fingerprint === 'string' ? epochRow.membership_fingerprint : null,
      envelopes: (data ?? []) as unknown[],
    });
  } catch (error) {
    console.error('[hub/epochs] retrieval exception', error instanceof Error ? error.message : 'unknown');
    return apiError('Hub E2EE v2 key retrieval failed', 500, HUB_E2EE_V2_ERROR);
  }
}
