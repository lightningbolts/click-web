import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { apiError } from '@/lib/api/errors';
import { parseBody } from '@/lib/api/parseBody';
import { createChatGatekeeperAdmin, requireBearerUser } from '@/lib/server/chatGatekeeper';
import { APPROVAL_EPOCH, APPROVAL_SENDER_DEVICE_ID, approvalChatId, createApprovalChallenge } from '@/lib/server/deviceApproval';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const bodySchema = z.object({ approving_device_id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/) }).strict();

/**
 * POST /api/chat/devices/history-requests/{id}/challenge { approving_device_id } — a one-time
 * challenge wrapped to the approving device's identity key. The device unwraps it (proving it
 * holds the key) and sends it back with its decision. 404 unless the request is the caller's,
 * pending and unexpired, and the approver is another of the caller's active devices.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ requestId: string }> }) {
  const auth = await requireBearerUser(request);
  if (!auth.ok) return auth.response;
  const { requestId } = await params;
  if (!UUID_PATTERN.test(requestId)) return apiError('Request not found', 404, 'NOT_FOUND');
  const parsed = await parseBody(request, bodySchema);
  if (!parsed.ok) return parsed.response;

  try {
    const admin = createChatGatekeeperAdmin();
    const { data } = await admin
      .from('chat_device_history_requests')
      .select('id, user_id, recipient_device_id, status, expires_at')
      .eq('id', requestId)
      .maybeSingle();
    const row = data as { id: string; user_id: string; recipient_device_id: string; status: string; expires_at: string } | null;
    if (!row || row.user_id !== auth.user.id || row.status !== 'pending' || Date.parse(row.expires_at) <= Date.now()) {
      return apiError('Request not found', 404, 'NOT_FOUND');
    }
    const challenge = await createApprovalChallenge(admin, {
      userId: auth.user.id,
      requestId,
      recipientDeviceRowId: row.recipient_device_id,
      approvingDeviceId: parsed.data.approving_device_id,
    });
    if (!challenge) return apiError('This device can’t approve that request', 403, 'APPROVER_NOT_ALLOWED');
    return NextResponse.json({
      challenge_id: challenge.challengeId,
      envelope: challenge.envelope,
      chat_id: approvalChatId(requestId),
      epoch: APPROVAL_EPOCH,
      sender_device_id: APPROVAL_SENDER_DEVICE_ID,
    });
  } catch (e) {
    console.error('[chat/devices/history-requests/challenge]', e instanceof Error ? e.message : 'unknown');
    return apiError('Could not start approval', 500, 'HISTORY_REQUEST_FAILED');
  }
}
