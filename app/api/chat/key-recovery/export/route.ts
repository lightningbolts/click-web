import { NextRequest, NextResponse } from 'next/server';
import { HISTORY_RECOVERY_ENABLED } from '@/lib/chat/recoveryFeature';
import { createChatGatekeeperAdmin, requireBearerUser } from '@/lib/server/chatGatekeeper';

// Return ciphertext envelopes only; the browser unwraps with its non-extractable X25519 key.
// Existing per-conversation RPCs independently enforce membership and history-sharing rules.
const PAGE = 100;
const DEVICE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export async function GET(req: NextRequest) {
  if (!HISTORY_RECOVERY_ENABLED) return NextResponse.json({ error: 'Recovery not enabled' }, { status: 404 });
  const auth = await requireBearerUser(req);
  if (!auth.ok) return auth.response;
  const deviceId = req.nextUrl.searchParams.get('device_id') ?? '';
  const scope = req.nextUrl.searchParams.get('scope') ?? 'chat';
  const pageString = req.nextUrl.searchParams.get('page') ?? '0';
  const page = Number(pageString);
  if (!DEVICE_ID_PATTERN.test(deviceId) || !['chat', 'hub'].includes(scope) ||
      !/^\d{1,5}$/.test(pageString) || !Number.isSafeInteger(page)) {
    return NextResponse.json({ error: 'Invalid history export request' }, { status: 400 });
  }
  const admin = createChatGatekeeperAdmin();
  const { data: device, error: deviceError } = await admin.from('chat_devices')
    .select('id').eq('user_id', auth.user.id).eq('device_id', deviceId)
    .eq('key_algorithm', 'X25519').eq('crypto_version', 2).is('revoked_at', null).maybeSingle();
  if (deviceError) return NextResponse.json({ error: 'History export unavailable' }, { status: 503 });
  if (!device) return NextResponse.json({ error: 'Unknown device' }, { status: 404 });

  const table = scope === 'chat' ? 'chat_recipient_key_envelopes' : 'hub_recipient_key_envelopes';
  const idColumn = scope === 'chat' ? 'chat_id' : 'hub_id';
  const { data: references, error: referencesError } = await admin.from(table)
    .select(idColumn).eq('recipient_device_id', device.id)
    .order(idColumn).range(page * PAGE, (page + 1) * PAGE - 1);
  if (referencesError) return NextResponse.json({ error: 'History export unavailable' }, { status: 503 });

  const ids = [...new Set((references ?? []).map((row) => String((row as Record<string, unknown>)[idColumn])))];
  const results = await Promise.all(ids.map((id) => admin.rpc(
    scope === 'chat' ? 'get_chat_key_envelopes_for_device' : 'get_hub_key_envelopes_for_device',
    scope === 'chat'
      ? { p_chat_id: id, p_user_id: auth.user.id, p_device_id: deviceId }
      : { p_hub_id: id, p_user_id: auth.user.id, p_device_id: deviceId },
  )));
  if (results.some((result) => result.error)) {
    return NextResponse.json({ error: 'History export unavailable' }, { status: 503 });
  }
  const items = results.flatMap((result, index) =>
    (result.data ?? []).map((row: Record<string, unknown>) => ({
      scope, id: ids[index], epoch: row.epoch,
      recipientDeviceId: deviceId, senderDeviceId: row.sender_device_id,
      envelope: row.envelope,
    })),
  );
  return NextResponse.json({
    items,
    nextPage: (references ?? []).length === PAGE ? page + 1 : null,
  }, { headers: { 'Cache-Control': 'no-store' } });
}
