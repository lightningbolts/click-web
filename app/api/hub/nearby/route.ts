/**
 * GET /api/hub/nearby?lat=&lon=&radius_meters=&limit=
 * Active community hubs near a point via PostGIS RPC (single round-trip).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServiceRoleClient } from '@/lib/server/supabaseServer';
import { getSupabaseFromRouteRequest } from '@/lib/server/supabaseRouteAuth';

type HubNearbyRow = {
  id: string;
  name: string;
  category?: string | null;
  geofence_lat: number;
  geofence_long: number;
  radius_meters: number | null;
  expires_at?: string | null;
  distance_meters: number;
  participant_count: number;
};

export async function GET(request: NextRequest) {
  const { user, authError } = await getSupabaseFromRouteRequest(request);
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const latRaw = url.searchParams.get('lat');
  const lonRaw = url.searchParams.get('lon');
  const radiusRaw = url.searchParams.get('radius_meters');
  const limitRaw = url.searchParams.get('limit');

  const lat = latRaw != null ? Number(latRaw) : NaN;
  const lon = lonRaw != null ? Number(lonRaw) : NaN;
  const radiusMeters =
    radiusRaw != null && radiusRaw.trim() !== ''
      ? Math.min(Math.max(Number(radiusRaw), 100), 100_000)
      : 15_000;
  const limit =
    limitRaw != null && limitRaw.trim() !== ''
      ? Math.min(Math.max(Number(limitRaw), 1), 100)
      : 50;

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return NextResponse.json({ error: 'lat and lon query params are required' }, { status: 400 });
  }
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return NextResponse.json({ error: 'Coordinates out of range' }, { status: 400 });
  }

  const admin = createSupabaseServiceRoleClient();

  const { data: rows, error } = await admin.rpc('get_hubs_nearby', {
    lat,
    lng: lon,
    radius_meters: radiusMeters,
    p_limit: limit,
  });

  if (error) {
    console.error('[hub/nearby] get_hubs_nearby:', error.message);
    return NextResponse.json({ error: 'Failed to load hubs' }, { status: 500 });
  }

  const hubs = ((rows ?? []) as HubNearbyRow[]).map((h) => ({
    id: h.id,
    name: h.name,
    category: h.category ?? 'general',
    geofence_lat: h.geofence_lat,
    geofence_long: h.geofence_long,
    radius_meters: h.radius_meters ?? 50,
    expires_at: h.expires_at,
    distance_meters: h.distance_meters,
    participant_count: Number(h.participant_count ?? 0),
  }));

  return NextResponse.json({ hubs });
}
