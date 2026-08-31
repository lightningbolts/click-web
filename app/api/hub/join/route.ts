/**
 * POST /api/hub/join
 * Register as a hub participant.
 * Event hubs: check-in or host (no GPS). Standalone hubs: use verify-hub-proximity.
 */

import { NextRequest, NextResponse } from 'next/server';
import { assertHubAccess } from '@/lib/server/hubGatekeeper';
import { createChatGatekeeperAdmin, requireBearerUser } from '@/lib/server/chatGatekeeper';
import { parseBody } from '@/lib/api/parseBody';
import { hubJoinBodySchema } from '@/lib/api/schemas/beacons';

export async function POST(request: NextRequest) {
  const auth = await requireBearerUser(request);
  if (!auth.ok) return auth.response;

  const parsed = await parseBody(request, hubJoinBodySchema);
  if (!parsed.ok) return parsed.response;

  const hubId = String(parsed.data.hub_id ?? '').trim();
  if (!hubId) {
    return NextResponse.json({ error: 'hub_id is required' }, { status: 400 });
  }

  const admin = createChatGatekeeperAdmin();
  const denied = await assertHubAccess(admin, hubId, auth.user.id);
  if (denied) return denied;

  const { data: venue, error: venueErr } = await admin
    .from('hub_venues')
    .select('id, name, creator_id, event_beacon_id')
    .eq('id', hubId)
    .maybeSingle();

  if (venueErr || venue == null) {
    return NextResponse.json({ error: 'Unknown hub' }, { status: 404 });
  }

  const { error: participantErr } = await admin
    .from('hub_participants')
    .upsert({ hub_id: hubId, user_id: auth.user.id }, { onConflict: 'hub_id,user_id', ignoreDuplicates: true });
  if (participantErr) {
    console.error('[hub/join] participant upsert:', participantErr.message);
    return NextResponse.json({ error: 'Failed to join hub' }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    hub_id: venue.id,
    name: venue.name,
    channel: `hub:${venue.id}`,
    creator_id: venue.creator_id ?? null,
    event_beacon_id: venue.event_beacon_id ?? null,
  });
}
