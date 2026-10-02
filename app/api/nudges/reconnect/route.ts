import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseFromRouteRequest } from '@/lib/server/supabaseRouteAuth';
import { createAdminSupabaseClient } from '@/lib/server/admin/supabaseAdmin';
import { requireFeature } from '@/lib/server/featureFlags';
import { featureMutationRateLimitResponse } from '@/lib/server/rateLimit';
import { coarsen } from '@/lib/nudges/reconnectNearby';
import { reconnectConfigFrom, reconnectNudgeFor } from '@/lib/server/reconnectNearby';

/**
 * GET /api/nudges/reconnect?lat&lng — on app open with foreground location: `{ nudge }` for a
 * connection the viewer met near here 2+ weeks ago, or `{ nudge: null }`. Coordinates are rounded
 * to ~100 m and never stored. At most one a day; 30-day cooldown per connection.
 */
export async function GET(request: NextRequest): Promise<Response> {
  try {
    const { user, authError } = await getSupabaseFromRouteRequest(request);
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const admin = createAdminSupabaseClient();
    const feature = await requireFeature(admin, 'reconnect_nearby', user.id);
    if (!feature.ok) return feature.response;
    // This read records what it shows: budget it like a write.
    const limited = await featureMutationRateLimitResponse('reconnect_nearby', user.id);
    if (limited) return limited;
    const lat = Number(request.nextUrl.searchParams.get('lat'));
    const lng = Number(request.nextUrl.searchParams.get('lng'));
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      return NextResponse.json({ error: 'lat and lng are required' }, { status: 400 });
    }
    const nudge = await reconnectNudgeFor(admin, user.id, { lat: coarsen(lat), lng: coarsen(lng) }, reconnectConfigFrom(feature.config));
    return NextResponse.json({ nudge }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('GET /api/nudges/reconnect:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
