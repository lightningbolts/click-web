/**
 * POST /api/hub/leave — leave a hub as the authenticated participant.
 *
 * Body JSON: { hub_id: string } or { hubId: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createChatGatekeeperAdmin, requireBearerUser } from '@/lib/server/chatGatekeeper';

export async function POST(request: NextRequest) {
  const auth = await requireBearerUser(request);
  if (!auth.ok) return auth.response;

  let body: { hub_id?: unknown; hubId?: unknown };
  try {
    body = (await request.json()) as { hub_id?: unknown; hubId?: unknown };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const hubIdRaw = typeof body.hub_id === 'string' ? body.hub_id : typeof body.hubId === 'string' ? body.hubId : '';
  const hubId = hubIdRaw.trim();
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
    console.error('[hub/leave POST] leave error:', error.message);
    return NextResponse.json({ error: 'Failed to leave hub' }, { status: 500 });
  }

  return NextResponse.json({ left: true });
}
