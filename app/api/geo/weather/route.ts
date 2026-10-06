import { NextRequest, NextResponse } from 'next/server';
import { isRateLimited, READ_HEAVY_RATE_LIMIT_BINDING } from '@/lib/server/rateLimit';
import { clientIpFromRequest } from '@/lib/events/eventMetadata';
import { fetchPlaceWeather } from '@/lib/server/weather';

/**
 * GET ?lat&lng[&at=ISO] — weather at a place right now and, for a time up to a week ahead, the
 * forecast for that hour (an event's location line). Public like the other geo proxies (event
 * pages are public), IP-rate-limited, and cached for 10 minutes on ~100 m cells.
 */
export const publicRoute = true;

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const lat = Number(params.get('lat'));
  const lng = Number(params.get('lng'));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return NextResponse.json({ error: 'lat and lng are required' }, { status: 400 });
  }
  const atRaw = params.get('at');
  const atMs = atRaw ? Date.parse(atRaw) : null;
  if (atRaw && !Number.isFinite(atMs)) {
    return NextResponse.json({ error: 'at must be an ISO date' }, { status: 400 });
  }

  const ip = clientIpFromRequest(request);
  if (
    await isRateLimited({ bindingName: READ_HEAVY_RATE_LIMIT_BINDING, key: `geo-weather:${ip}`, limit: 30, windowMs: 60_000 })
  ) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  const weather = await fetchPlaceWeather(lat, lng, atMs);
  return NextResponse.json(weather, {
    headers: { 'Cache-Control': weather.now ? 'public, max-age=600, s-maxage=600' : 'no-store' },
  });
}
