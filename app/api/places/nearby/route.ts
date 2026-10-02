import { NextRequest, NextResponse } from 'next/server';
import { apiError } from '@/lib/api/errors';
import { applyPlaceFilters, parsePlaceFilters } from '@/lib/places/filters';
import { enrichPlaces } from '@/lib/server/places/enrich';
import { isConsumerPlace, PLACE_COLUMNS, type PlaceRow } from '@/lib/server/places/loadPlace';
import { placesRateLimitResponse, requirePlacesUser } from '@/lib/server/places/routeContext';
import { serializePlaceSummary } from '@/lib/server/places/serialize';

function numberParam(params: URLSearchParams, ...keys: string[]): number | null {
  for (const key of keys) {
    const raw = params.get(key);
    if (raw == null || raw.trim() === '') continue;
    const n = Number(raw);
    return Number.isFinite(n) ? n : Number.NaN;
  }
  return null;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** GET /api/places/nearby — listed Places around a point, enriched, then filtered (§5.2). */
export async function GET(request: NextRequest) {
  try {
    const ctx = await requirePlacesUser(request);
    if (!ctx.ok) return ctx.response;
    const { admin, user, config } = ctx;
    const limited = await placesRateLimitResponse('nearby', user.id);
    if (limited) return limited;

    const params = request.nextUrl.searchParams;
    const lat = numberParam(params, 'lat', 'latitude');
    const lng = numberParam(params, 'lon', 'lng', 'longitude');
    if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      return apiError('lat and lon must be valid coordinates', 400, 'invalid_coordinates');
    }
    const radiusRaw = numberParam(params, 'radius_meters', 'radius');
    const limitRaw = numberParam(params, 'limit');
    const radius = clamp(
      radiusRaw != null && Number.isFinite(radiusRaw) ? radiusRaw : config.nearbyDefaultRadiusMeters,
      50,
      config.nearbyMaxRadiusMeters,
    );
    const limit = Math.floor(clamp(limitRaw != null && Number.isFinite(limitRaw) ? limitRaw : 100, 1, config.nearbyMaxLimit));

    const { data: hits, error: rpcError } = await admin.rpc('places_nearby', {
      p_lat: lat,
      p_lng: lng,
      p_radius_meters: radius,
      p_limit: limit,
    });
    if (rpcError) {
      console.error('[places/nearby] rpc:', rpcError.message);
      return apiError('Failed to load Places', 500);
    }
    const ordered = ((hits ?? []) as Array<{ place_id: string; distance_meters: number }>).filter((h) => typeof h.place_id === 'string');
    if (ordered.length === 0) return NextResponse.json({ places: [] });

    const { data: rows, error } = await admin
      .from('places')
      .select(PLACE_COLUMNS)
      .in('id', ordered.map((h) => h.place_id));
    if (error) {
      console.error('[places/nearby] places:', error.message);
      return apiError('Failed to load Places', 500);
    }
    const byId = new Map(((rows ?? []) as PlaceRow[]).map((r) => [r.id, r]));
    const places = ordered.map((h) => byId.get(h.place_id) ?? null).filter(isConsumerPlace);

    const nowMs = Date.now();
    const { enrichments } = await enrichPlaces(admin, places, { viewerId: user.id, config, nowMs });
    const distance = new Map(ordered.map((h) => [h.place_id, h.distance_meters]));
    const summaries = places.map((p) =>
      serializePlaceSummary(p, enrichments.get(p.id)!, { distanceMeters: distance.get(p.id) ?? null, nowMs }),
    );
    return NextResponse.json({ places: applyPlaceFilters(summaries, parsePlaceFilters(params)) });
  } catch (e) {
    console.error('GET /api/places/nearby:', e);
    return apiError('Internal Server Error', 500);
  }
}
