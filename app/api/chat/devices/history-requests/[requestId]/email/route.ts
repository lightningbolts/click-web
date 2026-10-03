import { NextRequest, NextResponse } from 'next/server';
import { apiError } from '@/lib/api/errors';
import { createChatGatekeeperAdmin, requireBearerUser } from '@/lib/server/chatGatekeeper';
import { emailApprovalLink } from '@/lib/server/deviceApproval';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/chat/devices/history-requests/{id}/email — "Email me a link" from the waiting device,
 * for when no other device is at hand. Sends once per request (`{ sent: false }` if already sent).
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ requestId: string }> }) {
  const auth = await requireBearerUser(request);
  if (!auth.ok) return auth.response;
  const { requestId } = await params;
  if (!UUID_PATTERN.test(requestId)) return apiError('Request not found', 404, 'NOT_FOUND');
  try {
    const sent = await emailApprovalLink(createChatGatekeeperAdmin(), requestId, auth.user.id, new Date().toISOString());
    return NextResponse.json({ sent });
  } catch (e) {
    console.error('[chat/devices/history-requests/email]', e instanceof Error ? e.message : 'unknown');
    return apiError('Could not send the email', 500, 'HISTORY_REQUEST_FAILED');
  }
}
