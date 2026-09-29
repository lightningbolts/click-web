import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { apiError } from '@/lib/api/errors';
import { parseBody } from '@/lib/api/parseBody';
import { createChatGatekeeperAdmin, requireBearerUser } from '@/lib/server/chatGatekeeper';
import { sessionProvesEmailAccess } from '@/lib/server/deviceHistory';

// Approve or deny sharing chat history with one of the caller's newer devices. Only a session
// created from the emailed magic link (recent `otp` / `magiclink` amr) may decide.

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const decisionSchema = z.object({ decision: z.enum(['approve', 'deny']) }).strict();

type RequestRow = {
  id: string;
  user_id: string;
  status: 'pending' | 'approved' | 'denied';
  created_at: string;
  expires_at: string;
  decided_at: string | null;
  device: { created_at: string; revoked_at: string | null } | null;
};

type DeviceJoin = { created_at: string; revoked_at: string | null };

/** PostgREST may return the to-one `chat_devices` join as an object or a one-element array. */
function normalizeRow(raw: unknown): RequestRow | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Omit<RequestRow, 'device'> & { device: DeviceJoin | DeviceJoin[] | null };
  const device = Array.isArray(row.device) ? (row.device[0] ?? null) : row.device;
  return { ...row, device };
}

async function loadOwnRequest(requestId: string, userId: string) {
  const admin = createChatGatekeeperAdmin();
  const { data, error } = await admin
    .from('chat_device_history_requests')
    .select('id, user_id, status, created_at, expires_at, decided_at, device:chat_devices(created_at, revoked_at)')
    .eq('id', requestId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const row = normalizeRow(data);
  return { admin, row: row && row.user_id === userId ? row : null };
}

function projection(row: RequestRow) {
  return {
    id: row.id,
    status: row.status,
    created_at: row.created_at,
    expires_at: row.expires_at,
    decided_at: row.decided_at,
    device_registered_at: row.device?.created_at ?? null,
    expired: row.status === 'pending' && Date.parse(row.expires_at) <= Date.now(),
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ requestId: string }> },
) {
  const auth = await requireBearerUser(request);
  if (!auth.ok) return auth.response;
  const { requestId } = await params;
  if (!UUID_PATTERN.test(requestId)) return apiError('Request not found', 404, 'NOT_FOUND');

  try {
    const { row } = await loadOwnRequest(requestId, auth.user.id);
    if (!row) return apiError('Request not found', 404, 'NOT_FOUND');
    return NextResponse.json({ request: projection(row) });
  } catch (error) {
    console.error('[chat/devices/history-requests] load failed', error instanceof Error ? error.message : 'unknown');
    return apiError('Could not load the request', 500, 'HISTORY_REQUEST_FAILED');
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ requestId: string }> },
) {
  const auth = await requireBearerUser(request);
  if (!auth.ok) return auth.response;
  const { requestId } = await params;
  if (!UUID_PATTERN.test(requestId)) return apiError('Request not found', 404, 'NOT_FOUND');

  const parsed = await parseBody(request, decisionSchema);
  if (!parsed.ok) return parsed.response;

  if (!sessionProvesEmailAccess(auth.bearer)) {
    return apiError('Open the link from your email to approve this device', 403, 'EMAIL_PROOF_REQUIRED');
  }

  try {
    const { admin, row } = await loadOwnRequest(requestId, auth.user.id);
    if (!row) return apiError('Request not found', 404, 'NOT_FOUND');
    if (row.status !== 'pending') {
      return apiError('This request was already decided', 409, 'HISTORY_REQUEST_DECIDED');
    }
    if (Date.parse(row.expires_at) <= Date.now()) {
      return apiError('This request has expired', 410, 'HISTORY_REQUEST_EXPIRED');
    }
    if (!row.device || row.device.revoked_at) {
      return apiError('That device is no longer active', 410, 'HISTORY_REQUEST_DEVICE_GONE');
    }

    const status = parsed.data.decision === 'approve' ? 'approved' : 'denied';
    const { data, error } = await admin
      .from('chat_device_history_requests')
      .update({ status, decided_at: new Date().toISOString() })
      .eq('id', requestId)
      .eq('status', 'pending')
      .select('id, user_id, status, created_at, expires_at, decided_at, device:chat_devices(created_at, revoked_at)')
      .maybeSingle();
    if (error) throw new Error(error.message);
    const decided = normalizeRow(data);
    if (!decided) return apiError('This request was already decided', 409, 'HISTORY_REQUEST_DECIDED');
    return NextResponse.json({ request: projection(decided) });
  } catch (error) {
    console.error('[chat/devices/history-requests] decision failed', error instanceof Error ? error.message : 'unknown');
    return apiError('Could not save your decision', 500, 'HISTORY_REQUEST_FAILED');
  }
}
