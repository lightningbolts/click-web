import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseFromRouteRequest } from '@/lib/server/supabaseRouteAuth';
import { createAdminSupabaseClient } from '@/lib/server/admin/supabaseAdmin';
import { parseBody } from '@/lib/api/parseBody';
import { alertConfirmBodySchema } from '@/lib/api/schemas/beacons';
import { requireFeature } from '@/lib/server/featureFlags';
import { featureMutationRateLimitResponse } from '@/lib/server/rateLimit';
import { haversineMeters } from '@/lib/server/eventEngagement';
import { decideAlertConfirmation } from '@/lib/map/alertConfirmations';
import {
  alertConfigFrom,
  clearAlert,
  extendAlert,
  loadAlertVotes,
  loadVisibleAlertBeacon,
  recordAlertVote,
} from '@/lib/server/alertConfirmations';

type Params = { params: Promise<{ beaconId: string }> };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const REJECTIONS = {
  expired: { status: 410, error: 'This alert has already ended.' },
  location_required: { status: 400, error: 'Your location is needed to confirm an alert.' },
  out_of_range: { status: 403, error: 'You need to be near this alert to confirm it.' },
  already_voted: { status: 409, error: "You've already confirmed this alert recently." },
} as const;

type Authorized = {
  ok: true;
  user: { id: string };
  admin: ReturnType<typeof createAdminSupabaseClient>;
  config: ReturnType<typeof alertConfigFrom>;
};

async function authorize(request: NextRequest, beaconId: string): Promise<Authorized | { ok: false; response: Response }> {
  if (!UUID_RE.test(beaconId)) {
    return { ok: false, response: NextResponse.json({ error: 'Invalid beacon id' }, { status: 400 }) };
  }
  const { user, authError } = await getSupabaseFromRouteRequest(request);
  if (authError || !user) return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const admin = createAdminSupabaseClient();
  const feature = await requireFeature(admin, 'alert_confirmations', user.id);
  if (!feature.ok) return { ok: false, response: feature.response };
  return { ok: true, user, admin, config: alertConfigFrom(feature.config) };
}

/**
 * GET /api/beacons/{id}/confirm — `{ state, expires_at, last_still_here_at, my_vote, is_creator }`.
 * No counts: the only public signal is when someone last saw it.
 */
export async function GET(request: NextRequest, { params }: Params): Promise<Response> {
  try {
    const { beaconId } = await params;
    const auth = await authorize(request, beaconId);
    if (!auth.ok) return auth.response;
    const loaded = await loadVisibleAlertBeacon(auth.admin, beaconId, auth.user.id);
    if ('response' in loaded) return loaded.response;
    const { beacon } = loaded;
    const now = Date.now();
    const votes = await loadAlertVotes(
      auth.admin,
      beaconId,
      new Date(now - auth.config.voteWindowMinutes * 60_000).toISOString(),
    );
    const lastSighting = votes.find((v) => v.status === 'still_here');
    const mine = votes.find((v) => v.userId === auth.user.id);
    return NextResponse.json({
      state: beacon.clearedAt ? 'cleared' : beacon.expiresAtMs > now ? 'active' : 'expired',
      expires_at: new Date(beacon.expiresAtMs).toISOString(),
      last_still_here_at: lastSighting ? new Date(lastSighting.createdAtMs).toISOString() : null,
      my_vote: mine ? { status: mine.status, created_at: new Date(mine.createdAtMs).toISOString() } : null,
      is_creator: beacon.creatorId === auth.user.id,
      radius_meters: auth.config.radiusMeters,
    });
  } catch (e) {
    console.error('GET /api/beacons/[beaconId]/confirm:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

/**
 * POST /api/beacons/{id}/confirm { status: 'still_here' | 'cleared', lat?, lng? }
 * Voters must be within the configured radius (the creator may clear from anywhere); one vote per
 * person per window. Returns `{ outcome, expires_at }`.
 */
export async function POST(request: NextRequest, { params }: Params): Promise<Response> {
  try {
    const { beaconId } = await params;
    const auth = await authorize(request, beaconId);
    if (!auth.ok) return auth.response;
    const limited = await featureMutationRateLimitResponse('alert_confirmations', auth.user.id);
    if (limited) return limited;
    const parsed = await parseBody(request, alertConfirmBodySchema);
    if (!parsed.ok) return parsed.response;
    const { status, lat, lng } = parsed.data;

    const loaded = await loadVisibleAlertBeacon(auth.admin, beaconId, auth.user.id);
    if ('response' in loaded) return loaded.response;
    const { beacon } = loaded;
    const now = Date.now();
    if (beacon.clearedAt) return NextResponse.json(REJECTIONS.expired, { status: 410 });

    const votes = await loadAlertVotes(
      auth.admin,
      beaconId,
      new Date(now - auth.config.voteWindowMinutes * 60_000).toISOString(),
    );
    const decision = decideAlertConfirmation({
      creatorId: beacon.creatorId,
      createdAtMs: beacon.createdAtMs,
      expiresAtMs: beacon.expiresAtMs,
      voterId: auth.user.id,
      status,
      distanceMeters: lat != null && lng != null ? haversineMeters(lat, lng, beacon.lat, beacon.lng) : null,
      votes,
      nowMs: now,
      config: auth.config,
    });

    if (decision.outcome === 'rejected') {
      const rejection = REJECTIONS[decision.reason];
      return NextResponse.json({ error: rejection.error, code: decision.reason }, { status: rejection.status });
    }

    await recordAlertVote(auth.admin, beaconId, auth.user.id, status);
    let expiresAtMs = beacon.expiresAtMs;
    if (decision.outcome === 'extended') {
      await extendAlert(auth.admin, beaconId, decision.expiresAtMs);
      expiresAtMs = decision.expiresAtMs;
    } else if (decision.outcome === 'cleared') {
      await clearAlert(auth.admin, beaconId, now);
      expiresAtMs = now;
    }
    return NextResponse.json({ outcome: decision.outcome, expires_at: new Date(expiresAtMs).toISOString() });
  } catch (e) {
    console.error('POST /api/beacons/[beaconId]/confirm:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
