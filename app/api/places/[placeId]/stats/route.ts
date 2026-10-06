import { NextRequest, NextResponse } from 'next/server';
import { apiError } from '@/lib/api/errors';
import { userMayViewPlaceInsights } from '@/lib/server/places/entitlement';
import { requirePlaceManagerContext } from '@/lib/server/places/routeContext';
import { placeTimezone } from '@/lib/server/places/serialize';
import { loadPlaceStats } from '@/lib/server/places/stats';

/**
 * GET /api/places/[placeId]/stats?range=30d|90d&detail=basic|full — aggregate manager stats
 * (§5.8). Any manager role; `detail=full` also needs Click for Business (402 otherwise).
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ placeId: string }> }) {
  try {
    const { placeId } = await params;
    const ctx = await requirePlaceManagerContext(request, placeId);
    if (!ctx.ok) return ctx.response;
    const { admin, supabase, user, place } = ctx;

    const search = request.nextUrl.searchParams;
    const range = search.get('range') === '90d' ? 90 : 30;
    const detail = search.get('detail') === 'full' ? 'full' : 'basic';
    if (detail === 'full' && !(await userMayViewPlaceInsights(supabase, user, place.id))) {
      return apiError('Full Place stats are part of Click for Business', 402, 'insights_required');
    }

    const stats = await loadPlaceStats(admin, { id: place.id, timezone: placeTimezone(place) }, { range, detail, nowMs: Date.now() });
    return NextResponse.json(stats);
  } catch (e) {
    console.error('GET /api/places/[placeId]/stats:', e);
    return apiError('Internal Server Error', 500);
  }
}
