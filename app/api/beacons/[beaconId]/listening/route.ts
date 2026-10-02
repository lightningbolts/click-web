import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseFromRouteRequest } from '@/lib/server/supabaseRouteAuth';
import { createAdminSupabaseClient } from '@/lib/server/admin/supabaseAdmin';
import { requireFeature } from '@/lib/server/featureFlags';
import { featureMutationRateLimitResponse } from '@/lib/server/rateLimit';
import { loadVisibleBeacon } from '@/lib/map/beaconVisibility';
import type { MapBeaconRecord } from '@/lib/map/mapBeacons';
import { loadListening, presenceConfigFrom } from '@/lib/server/soundtrackPresence';

type Params = { params: Promise<{ beaconId: string }> };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Authorized = {
  ok: true;
  userId: string;
  admin: ReturnType<typeof createAdminSupabaseClient>;
  config: ReturnType<typeof presenceConfigFrom>;
  beacon: MapBeaconRecord;
};

/** Signed in, in the soundtrack_presence cohort, and the beacon is a live soundtrack they can see. */
async function authorize(request: NextRequest, beaconId: string): Promise<Authorized | { ok: false; response: Response }> {
  if (!UUID_RE.test(beaconId)) {
    return { ok: false, response: NextResponse.json({ error: 'Invalid beacon id' }, { status: 400 }) };
  }
  const { user, authError } = await getSupabaseFromRouteRequest(request);
  if (authError || !user) return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const admin = createAdminSupabaseClient();
  const feature = await requireFeature(admin, 'soundtrack_presence', user.id);
  if (!feature.ok) return { ok: false, response: feature.response };
  const loaded = await loadVisibleBeacon(admin, beaconId, user.id);
  if (!loaded || loaded.beacon.beacon_type !== 'soundtrack' || !(Date.parse(loaded.beacon.expires_at) > Date.now())) {
    return { ok: false, response: NextResponse.json({ error: 'Not found' }, { status: 404 }) };
  }
  return { ok: true, userId: user.id, admin, config: presenceConfigFrom(feature.config), beacon: loaded.beacon };
}

/** GET — `{ count, is_listening, connections, heartbeat_seconds }`. Names: connections only. */
export async function GET(request: NextRequest, { params }: Params): Promise<Response> {
  try {
    const auth = await authorize(request, (await params).beaconId);
    if (!auth.ok) return auth.response;
    return NextResponse.json(await loadListening(auth.admin, auth.beacon.id, auth.userId, auth.config));
  } catch (e) {
    console.error('GET /api/beacons/[beaconId]/listening:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

/**
 * POST — "I'm listening": a heartbeat from anywhere (people listen on the map, not only at the
 * pin). Clients repeat it every `heartbeat_seconds` while listening; it lapses on its own.
 */
export async function POST(request: NextRequest, { params }: Params): Promise<Response> {
  try {
    const auth = await authorize(request, (await params).beaconId);
    if (!auth.ok) return auth.response;
    const limited = await featureMutationRateLimitResponse('soundtrack_presence', auth.userId);
    if (limited) return limited;
    const { error } = await auth.admin
      .from('beacon_presence')
      .upsert({ beacon_id: auth.beacon.id, user_id: auth.userId, last_seen_at: new Date().toISOString() });
    if (error) throw new Error(`beacon_presence upsert: ${error.message}`);
    return NextResponse.json(await loadListening(auth.admin, auth.beacon.id, auth.userId, auth.config));
  } catch (e) {
    console.error('POST /api/beacons/[beaconId]/listening:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

/** DELETE — stop listening now instead of waiting for the heartbeat to lapse. */
export async function DELETE(request: NextRequest, { params }: Params): Promise<Response> {
  try {
    const auth = await authorize(request, (await params).beaconId);
    if (!auth.ok) return auth.response;
    const { error } = await auth.admin
      .from('beacon_presence')
      .delete()
      .eq('beacon_id', auth.beacon.id)
      .eq('user_id', auth.userId);
    if (error) throw new Error(`beacon_presence delete: ${error.message}`);
    return NextResponse.json(await loadListening(auth.admin, auth.beacon.id, auth.userId, auth.config));
  } catch (e) {
    console.error('DELETE /api/beacons/[beaconId]/listening:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
