/**
 * POST /api/hub/leave — leave a hub as the authenticated participant.
 *
 * Body JSON: { hub_id: string } or { hubId: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createChatGatekeeperAdmin, requireBearerUser } from '@/lib/server/chatGatekeeper';
import { assertHubCanLeave } from '@/lib/server/hubGatekeeper';
import { parseBody } from '@/lib/api/parseBody';
import { hubLeaveBodySchema } from '@/lib/api/schemas/beacons';

export async function POST(request: NextRequest) {
  const auth = await requireBearerUser(request);
  if (!auth.ok) return auth.response;

  const parsed = await parseBody(request, hubLeaveBodySchema);
  if (!parsed.ok) return parsed.response;
  const hubId = parsed.data.hub_id.trim();

  const admin = createChatGatekeeperAdmin();
  const denied = await assertHubCanLeave(admin, hubId);
  if (denied) return denied;
  const { error } = await admin
    .from('hub_participants')
    .delete()
    .eq('hub_id', hubId)
    .eq('user_id', auth.user.id);

  if (error) {
    console.error('[hub/leave POST] leave error:', error.message);
    return NextResponse.json({ error: 'Failed to leave hub' }, { status: 500 });
  }

  return NextResponse.json({ left: true });
}
