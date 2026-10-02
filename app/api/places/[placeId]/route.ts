import { NextRequest, NextResponse } from 'next/server';
import { apiError } from '@/lib/api/errors';
import { parseBody } from '@/lib/api/parseBody';
import { placeManagerPatchBodySchema } from '@/lib/api/schemas/places';
import { parsePlaceHours } from '@/lib/places/hours';
import { runAfterResponse } from '@/lib/server/afterResponse';
import { buildViewerDetail } from '@/lib/server/places/detail';
import { loadConsumerPlace, PLACE_COLUMNS, type PlaceRow } from '@/lib/server/places/loadPlace';
import { ensurePlaceHub } from '@/lib/server/places/placeHub';
import { placeNotFound, requirePlaceManagerContext, requirePlacesUser } from '@/lib/server/places/routeContext';
import { serializeManagerPlace } from '@/lib/server/places/serialize';
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

/**
 * PATCH /api/places/[placeId] — owners and managers edit the consumer profile (§5.7). Not gated
 * by the user feature flag. Name, slug, category, coordinates, radius, verification and listing
 * stay admin-only.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ placeId: string }> }) {
  try {
    const { placeId } = await params;
    const ctx = await requirePlaceManagerContext(request, placeId, { roles: ['owner', 'manager'] });
    if (!ctx.ok) return ctx.response;
    const { admin, user, place, role } = ctx;

    const parsed = await parseBody(request, placeManagerPatchBodySchema);
    if (!parsed.ok) return apiError('Only description, hours, website, hub and address can be edited', 400, 'invalid_fields');
    const body = parsed.data;

    const patch: Record<string, unknown> = {};
    if (body.description !== undefined) patch.description = body.description || null;
    if (body.hours !== undefined) {
      if (body.hours === null) patch.hours = null;
      else {
        const hours = parsePlaceHours(body.hours);
        if (!hours) return apiError('Hours must look like {"mon":[["07:00","15:00"]]}', 400, 'invalid_hours');
        patch.hours = hours;
      }
    }
    if (body.website_url !== undefined) {
      if (body.website_url) {
        let url: URL | null = null;
        try {
          url = new URL(body.website_url);
        } catch {
          url = null;
        }
        if (!url || url.protocol !== 'https:') return apiError('Website must be an https:// link', 400, 'invalid_website');
        patch.website_url = url.toString();
      } else patch.website_url = null;
    }
    for (const key of ['address_line', 'city', 'region', 'postal_code'] as const) {
      if (body[key] !== undefined) patch[key] = body[key] || null;
    }
    if (body.hub_enabled !== undefined) patch.hub_enabled = body.hub_enabled;

    if (body.hub_enabled === true && !place.hub_enabled) {
      const hub = await ensurePlaceHub(admin, place, user.id);
      if (!hub.ok) return apiError(hub.error, 409, 'hub_unavailable');
    }

    let updated = place;
    if (Object.keys(patch).length > 0) {
      const { data, error } = await admin.from('places').update(patch).eq('id', place.id).select(PLACE_COLUMNS).single();
      if (error) {
        console.error('PATCH /api/places/[placeId]:', error.message);
        return apiError('Could not save the Place', 400, 'invalid_fields');
      }
      updated = data as PlaceRow;
    }
    return NextResponse.json({ place: serializeManagerPlace(updated, role) });
  } catch (e) {
    console.error('PATCH /api/places/[placeId]:', e);
    return apiError('Internal Server Error', 500);
  }
}
