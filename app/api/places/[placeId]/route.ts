import { NextRequest, NextResponse } from 'next/server';
import { apiError } from '@/lib/api/errors';
import { runAfterResponse } from '@/lib/server/afterResponse';
import { buildViewerDetail } from '@/lib/server/places/detail';
import { loadConsumerPlace } from '@/lib/server/places/loadPlace';
import { placeNotFound, requirePlacesUser } from '@/lib/server/places/routeContext';
import { emitProductEvent } from '@/lib/server/telemetry/productEvents';

const VIEW_SOURCES = new Set(['map', 'nearby', 'event', 'link', 'qr', 'history']);

/** GET /api/places/[placeId] — PlaceDetail for a signed-in caller (§5.3). Accepts a UUID or slug. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ placeId: string }> }) {
  try {
    const { placeId } = await params;
    const ctx = await requirePlacesUser(request);
    if (!ctx.ok) return ctx.response;
    const { admin, user, config } = ctx;

    const place = await loadConsumerPlace(admin, placeId);
    if (!place) return placeNotFound();

    const detail = await buildViewerDetail(admin, place, user.id, config, Date.now());

    const source = request.nextUrl.searchParams.get('source');
    if (source && VIEW_SOURCES.has(source)) {
      runAfterResponse('place_viewed', () => emitProductEvent(admin, user.id, 'place_viewed', { source }));
    }
    return NextResponse.json({ place: detail });
  } catch (e) {
    console.error('GET /api/places/[placeId]:', e);
    return apiError('Internal Server Error', 500);
  }
}
