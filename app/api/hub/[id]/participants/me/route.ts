/**
 * DELETE /api/hub/[id]/participants/me — leave a hub as the authenticated participant.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createChatGatekeeperAdmin, requireBearerUser } from '@/lib/server/chatGatekeeper';

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(request: NextRequest, context: RouteContext) {
  const auth = await requireBearerUser(request);
  if (!auth.ok) return auth.response;

  const { id: rawHubId } = await context.params;
  const hubId = rawHubId?.trim();
  if (!hubId) {
    return NextResponse.json({ error: 'Hub id is required' }, { status: 400 });
  }

  const admin = createChatGatekeeperAdmin();
  const { error } = await admin
    .from('hub_participants')
    .delete()
    .eq('hub_id', hubId)
    .eq('user_id', auth.user.id);

  if (error) {
    console.error('[hub/participants/me DELETE] leave error:', error.message);
    return NextResponse.json({ error: 'Failed to leave hub' }, { status: 500 });
  }

  return NextResponse.json({ left: true });
}
