import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { apiError } from '@/lib/api/errors';
import { parseBody } from '@/lib/api/parseBody';
import { createChatGatekeeperAdmin, requireBearerUser } from '@/lib/server/chatGatekeeper';
import { loadOwnDevice, notifyDevicesOfNewSignIn } from '@/lib/server/deviceApproval';
import { requestHistoryApprovalForNewDevice } from '@/lib/server/deviceHistory';

const DEVICE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const createSchema = z.object({ device_id: z.string().regex(DEVICE_ID_PATTERN), reopen: z.boolean().optional() }).strict();

type RequestRow = {
  id: string;
  recipient_device_id: string;
  status: 'pending' | 'approved' | 'denied';
  created_at: string;
  expires_at: string;
  decided_at: string | null;
  email_sent_at: string | null;
};

const REQUEST_COLUMNS = 'id, recipient_device_id, status, created_at, expires_at, decided_at, email_sent_at';

function projection(row: RequestRow, label: string | null, nowMs: number) {
  return {
    id: row.id,
    status: row.status,
    device_label: label,
    created_at: row.created_at,
    expires_at: row.expires_at,
    decided_at: row.decided_at,
    email_sent: row.email_sent_at != null,
    expired: row.status === 'pending' && Date.parse(row.expires_at) <= nowMs,
  };
}

/**
 * GET /api/chat/devices/history-requests?device_id= — for this device: `incoming`, the account's
 * other devices waiting for approval (this device can approve them); `own`, this device's own
 * request, if it has one; and `approvers`, the account's older active devices that could approve
 * it (what kind each is and when it was last active), most recently active first.
 */
export async function GET(request: NextRequest) {
  const auth = await requireBearerUser(request);
  if (!auth.ok) return auth.response;
  const deviceId = (request.nextUrl.searchParams.get('device_id') ?? '').trim();
  if (!DEVICE_ID_PATTERN.test(deviceId)) return apiError('device_id is required', 400, 'INVALID_DEVICE');

  try {
    const admin = createChatGatekeeperAdmin();
    const me = await loadOwnDevice(admin, auth.user.id, deviceId);
    if (!me) return NextResponse.json({ incoming: [], own: null, approvers: [] });
    const [requests, older] = await Promise.all([
      admin
        .from('chat_device_history_requests')
        .select(`${REQUEST_COLUMNS}, device:chat_devices!recipient_device_id(device_label, revoked_at)`)
        .eq('user_id', auth.user.id)
        .order('created_at', { ascending: false })
        .limit(20),
      admin
        .from('chat_devices')
        .select('device_label, last_seen_at')
        .eq('user_id', auth.user.id)
        .is('revoked_at', null)
        .neq('id', me.id)
        .lt('created_at', me.created_at)
        .order('last_seen_at', { ascending: false })
        .limit(10),
    ]);
    const { data, error } = requests;
    if (error) throw new Error(error.message);
    if (older.error) throw new Error(older.error.message);
    const approvers = ((older.data ?? []) as Array<{ device_label: string | null; last_seen_at: string | null }>).map((row) => ({
      label: row.device_label,
      last_seen_at: row.last_seen_at,
    }));
    const nowMs = Date.now();
    const rows = (data ?? []) as Array<RequestRow & { device: { device_label: string | null; revoked_at: string | null } | Array<{ device_label: string | null; revoked_at: string | null }> | null }>;
    const deviceOf = (row: (typeof rows)[number]) => (Array.isArray(row.device) ? (row.device[0] ?? null) : row.device);
    const incoming = rows
      .filter((row) => row.recipient_device_id !== me.id && row.status === 'pending' && Date.parse(row.expires_at) > nowMs && !deviceOf(row)?.revoked_at)
      .map((row) => projection(row, deviceOf(row)?.device_label ?? null, nowMs));
    const ownRow = rows.find((row) => row.recipient_device_id === me.id);
    return NextResponse.json(
      { incoming, own: ownRow ? projection(ownRow, deviceOf(ownRow)?.device_label ?? null, nowMs) : null, approvers },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    console.error('[chat/devices/history-requests] list failed', e instanceof Error ? e.message : 'unknown');
    return apiError('Could not load approvals', 500, 'HISTORY_REQUEST_FAILED');
  }
}

/**
 * POST { device_id, reopen? } — this device can't read some messages: ask the account's other
 * devices to approve sharing history with it (a push now; the email link later if none does).
 * Idempotent; an expired request is asked again, a denied one only with `reopen`.
 */
export async function POST(request: NextRequest) {
  const auth = await requireBearerUser(request);
  if (!auth.ok) return auth.response;
  const parsed = await parseBody(request, createSchema);
  if (!parsed.ok) return parsed.response;

  try {
    const admin = createChatGatekeeperAdmin();
    const me = await loadOwnDevice(admin, auth.user.id, parsed.data.device_id);
    if (!me) return apiError('Register this device first', 404, 'DEVICE_NOT_REGISTERED');
    const { data: labelRow } = await admin.from('chat_devices').select('device_label').eq('id', me.id).maybeSingle();
    const label = (labelRow as { device_label: string | null } | null)?.device_label ?? null;
    const status = await requestHistoryApprovalForNewDevice(
      admin,
      auth.user,
      { id: me.id, created_at: me.created_at, device_label: label },
      (requestId, deviceLabel) => notifyDevicesOfNewSignIn(auth.user.id, requestId, deviceLabel),
      { reopen: parsed.data.reopen },
    );
    const { data: own } = await admin.from('chat_device_history_requests').select(REQUEST_COLUMNS).eq('recipient_device_id', me.id).maybeSingle();
    return NextResponse.json({ status, own: own ? projection(own as RequestRow, label, Date.now()) : null });
  } catch (e) {
    console.error('[chat/devices/history-requests] create failed', e instanceof Error ? e.message : 'unknown');
    return apiError('Could not ask for approval', 500, 'HISTORY_REQUEST_FAILED');
  }
}
