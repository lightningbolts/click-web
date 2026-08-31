import { type SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { evaluateEventHubAccess } from '@/lib/server/eventHubAccess';

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

type HubVenueGateRow = {
  id: string;
  geofence_lat: number;
  geofence_long: number;
  radius_meters: number | null;
  expires_at: string | null;
  creator_id: string | null;
  event_beacon_id: string | null;
};

function expiredResponse(): NextResponse {
  return NextResponse.json(
    {
      error: 'HUB_EXPIRED',
      message: 'This hub is no longer active.',
    },
    { status: 410 },
  );
}

function isHubExpired(expiresRaw: string | null | undefined): boolean {
  if (!expiresRaw) return false;
  const expMs = Date.parse(expiresRaw);
  return Number.isFinite(expMs) && expMs <= Date.now();
}

async function loadHubVenue(
  admin: SupabaseClient,
  hubId: string,
): Promise<{ venue: HubVenueGateRow } | { response: NextResponse }> {
  const trimmed = hubId.trim();
  if (!trimmed) {
    return { response: NextResponse.json({ error: 'hub_id is required' }, { status: 400 }) };
  }

  const { data: venue, error } = await admin
    .from('hub_venues')
    .select('id, geofence_lat, geofence_long, radius_meters, expires_at, creator_id, event_beacon_id')
    .eq('id', trimmed)
    .maybeSingle();

  if (error) {
    console.error('[hubGatekeeper] hub_venues:', error.message);
    return { response: NextResponse.json({ error: error.message }, { status: 400 }) };
  }
  if (!venue) {
    return { response: NextResponse.json({ error: 'Unknown hub' }, { status: 404 }) };
  }
  return { venue: venue as HubVenueGateRow };
}

async function assertEventLinkedHubAccess(
  admin: SupabaseClient,
  venue: HubVenueGateRow,
  userId: string,
): Promise<NextResponse | null> {
  if (isHubExpired(venue.expires_at)) return expiredResponse();

  const eventBeaconId = venue.event_beacon_id;
  if (!eventBeaconId) {
    return NextResponse.json({ error: 'Unknown hub' }, { status: 404 });
  }

  const [{ data: beacon }, { data: checkIn }, { data: rsvp }] = await Promise.all([
    admin.from('map_beacons').select('id, creator_id').eq('id', eventBeaconId).maybeSingle(),
    admin
      .from('event_check_ins')
      .select('user_id, checked_out_at')
      .eq('beacon_id', eventBeaconId)
      .eq('user_id', userId)
      .maybeSingle(),
    admin
      .from('beacon_attendees')
      .select('user_id')
      .eq('beacon_id', eventBeaconId)
      .eq('user_id', userId)
      .maybeSingle(),
  ]);

  const eventCreatorId =
    beacon != null && typeof (beacon as { creator_id?: unknown }).creator_id === 'string'
      ? (beacon as { creator_id: string }).creator_id
      : null;
  const hasActiveCheckIn =
    checkIn != null && (checkIn as { checked_out_at?: unknown }).checked_out_at == null;
  const allowed = evaluateEventHubAccess({
    userId,
    hubCreatorId: venue.creator_id,
    eventCreatorId,
    hasActiveCheckIn,
    hasRsvp: rsvp != null,
  });
  if (!allowed) {
    return NextResponse.json(
      {
        error: 'EVENT_HUB_ACCESS_DENIED',
        message: 'Check in to this event to join the hub.',
      },
      { status: 403 },
    );
  }
  return null;
}

function assertStandaloneGeofence(
  venue: HubVenueGateRow,
  userLat: number,
  userLong: number,
): NextResponse | null {
  if (isHubExpired(venue.expires_at)) return expiredResponse();

  if (
    typeof userLat !== 'number' ||
    typeof userLong !== 'number' ||
    Number.isNaN(userLat) ||
    Number.isNaN(userLong)
  ) {
    return NextResponse.json({ error: 'user_lat and user_long are required' }, { status: 400 });
  }
  if (userLat < -90 || userLat > 90 || userLong < -180 || userLong > 180) {
    return NextResponse.json({ error: 'Coordinates out of range' }, { status: 400 });
  }

  const radius =
    typeof venue.radius_meters === 'number' && venue.radius_meters > 0 ? venue.radius_meters : 50;

  const distanceM = haversineMeters(
    userLat,
    userLong,
    venue.geofence_lat as number,
    venue.geofence_long as number,
  );

  if (distanceM > radius) {
    return NextResponse.json(
      {
        error: 'OUT_OF_BOUNDS',
        message: 'You are no longer at this location.',
        distance_meters: Math.round(distanceM * 100) / 100,
        radius_meters: radius,
      },
      { status: 400 },
    );
  }

  return null;
}

/**
 * Event hubs: check-in / host (no GPS). Standalone hubs: geofence + expiry.
 */
export async function assertHubAccess(
  admin: SupabaseClient,
  hubId: string,
  userId: string,
  userLat?: number,
  userLong?: number,
): Promise<NextResponse | null> {
  const loaded = await loadHubVenue(admin, hubId);
  if ('response' in loaded) return loaded.response;
  const { venue } = loaded;
  if (venue.event_beacon_id) {
    return assertEventLinkedHubAccess(admin, venue, userId);
  }
  return assertStandaloneGeofence(venue, userLat ?? Number.NaN, userLong ?? Number.NaN);
}

/**
 * Ensures coordinates lie within [hubId]'s geofence (matches verify-hub-proximity Edge Function).
 * Event-linked hubs skip the fence and require check-in / host instead — pass [userId].
 */
export async function assertHubGeofenceFromCoords(
  admin: SupabaseClient,
  hubId: string,
  userLat: number,
  userLong: number,
  userId?: string,
): Promise<NextResponse | null> {
  const loaded = await loadHubVenue(admin, hubId);
  if ('response' in loaded) return loaded.response;
  const { venue } = loaded;
  if (venue.event_beacon_id) {
    if (!userId?.trim()) {
      return NextResponse.json({ error: 'Authorization required' }, { status: 401 });
    }
    return assertEventLinkedHubAccess(admin, venue, userId.trim());
  }
  return assertStandaloneGeofence(venue, userLat, userLong);
}
