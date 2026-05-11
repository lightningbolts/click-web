/**
 * GET /api/hub/nearby?lat=&lon=&radius_meters=
 * Active community hubs near a point (non-expired hub_venues); participant counts from hub_participants.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServiceRoleClient } from '@/lib/server/supabaseServer';
import { getSupabaseFromRouteRequest } from '@/lib/server/supabaseRouteAuth';

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

export async function GET(request: NextRequest) {
  const { user, authError } = await getSupabaseFromRouteRequest(request);
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const latRaw = url.searchParams.get('lat');
  const lonRaw = url.searchParams.get('lon');
  const radiusRaw = url.searchParams.get('radius_meters');

  const lat = latRaw != null ? Number(latRaw) : NaN;
  const lon = lonRaw != null ? Number(lonRaw) : NaN;
  const radiusMeters =
    radiusRaw != null && radiusRaw.trim() !== ''
      ? Math.min(Math.max(Number(radiusRaw), 100), 100_000)
      : 15_000;

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return NextResponse.json({ error: 'lat and lon query params are required' }, { status: 400 });
  }
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return NextResponse.json({ error: 'Coordinates out of range' }, { status: 400 });
  }

  const admin = createSupabaseServiceRoleClient();
  const nowIso = new Date().toISOString();

  const { data: rows, error } = await admin
    .from('hub_venues')
    .select('id, name, category, geofence_lat, geofence_long, radius_meters, expires_at')
    .gt('expires_at', nowIso);

  if (error) {
    console.error('[hub/nearby] hub_venues:', error.message);
    return NextResponse.json({ error: 'Failed to load hubs' }, { status: 500 });
  }

  type HubRow = {
    id: string;
    name: string;
    category?: string | null;
    geofence_lat: number;
    geofence_long: number;
    radius_meters: number | null;
    expires_at?: string | null;
  };

  const hubs = (rows ?? []) as HubRow[];

  const enriched = await Promise.all(
    hubs.map(async (h) => {
      const d = haversineMeters(lat, lon, h.geofence_lat, h.geofence_long);
      const { count, error: cErr } = await admin
        .from('hub_participants')
        .select('*', { count: 'exact', head: true })
        .eq('hub_id', h.id);

      if (cErr) {
        console.error('[hub/nearby] count:', cErr.message);
      }

      return {
        hub_id: h.id,
        name: h.name,
        category: typeof h.category === 'string' ? h.category : 'general',
        latitude: h.geofence_lat,
        longitude: h.geofence_long,
        radius_meters:
          typeof h.radius_meters === 'number' && h.radius_meters > 0 ? h.radius_meters : 50,
        active_user_count: typeof count === 'number' ? count : 0,
        distance_meters: Math.round(d * 100) / 100,
        expires_at: h.expires_at ?? null,
      };
    }),
  );

  const filtered = enriched.filter((h) => h.distance_meters <= radiusMeters + (h.radius_meters ?? 50));

  filtered.sort((a, b) => a.distance_meters - b.distance_meters);

  return NextResponse.json({ hubs: filtered }, { status: 200 });
}
