/**
 * POST /api/connections/{id}/wave — a low-pressure "thinking of you" to the other person
 * (in-app + push). At most one wave per person per connection per day.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseFromRouteRequest } from '@/lib/server/supabaseRouteAuth';
import { createAdminClient } from '@/lib/server/connectionWriteAuth';
import { pairConnection } from '@/lib/hangouts/hangouts';
import { deliverNudge, resolveNudges, userPushContext } from '@/lib/nudges/moments';

export async function POST(request: NextRequest, context: { params: Promise<{ connectionId: string }> }) {
  const { user, authError } = await getSupabaseFromRouteRequest(request);
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { connectionId } = await context.params;
  const admin = createAdminClient();
  const connection = await pairConnection(admin, connectionId, user.id);
  if (!connection) return NextResponse.json({ error: 'Connection not found' }, { status: 404 });
  const peerId = connection.userIds.find((id) => id !== user.id)!;

  const { data: me } = await admin.from('users').select('first_name, name').eq('id', user.id).maybeSingle();
  const row = me as { first_name?: string | null; name?: string | null } | null;
  const firstName = row?.first_name?.trim() || row?.name?.trim().split(/\s+/)[0] || 'A connection';
  const day = new Date().toISOString().slice(0, 10);

  const result = await deliverNudge(
    admin,
    {
      userId: peerId,
      type: 'wave',
      dedupeKey: `${connectionId}:${user.id}:${day}`,
      connectionId,
      payload: { peer_user_id: user.id, peer_first_name: firstName },
    },
    userPushContext(),
  );
  if (result === 'error') return NextResponse.json({ error: 'Failed to wave' }, { status: 500 });
  // Waving back answers their wave.
  await resolveNudges(admin, { type: 'wave', dedupeKey: `${connectionId}:${peerId}:${day}`, userIds: [user.id] }, 'acted_on_at');
  return NextResponse.json({ sent: result === 'created', already_waved_today: result === 'duplicate' });
}
