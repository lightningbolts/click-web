import { type SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

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

/**
 * Ensures coordinates lie within [hubId]'s geofence (matches verify-hub-proximity Edge Function).
 */
export async function assertHubGeofenceFromCoords(
  admin: SupabaseClient,
  hubId: string,
  userLat: number,
  userLong: number,
): Promise<NextResponse | null> {
  const trimmed = hubId.trim();
  if (!trimmed) {
    return NextResponse.json({ error: 'hub_id is required' }, { status: 400 });
  }
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

  const { data: venue, error } = await admin
    .from('hub_venues')
    .select('id, geofence_lat, geofence_long, radius_meters, expires_at')
    .eq('id', trimmed)
    .maybeSingle();

  if (error) {
    console.error('[hubGatekeeper] hub_venues:', error.message);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (!venue) {
    return NextResponse.json({ error: 'Unknown hub' }, { status: 404 });
  }

  const expiresRaw = venue.expires_at as string | null | undefined;
  if (expiresRaw) {
    const expMs = Date.parse(expiresRaw);
    if (Number.isFinite(expMs) && expMs <= Date.now()) {
      return NextResponse.json(
        {
          error: 'HUB_EXPIRED',
          message: 'This hub is no longer active.',
        },
        { status: 410 },
      );
    }
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
