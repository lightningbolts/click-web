import { NextRequest, NextResponse } from 'next/server';
import { apiError } from '@/lib/api/errors';
import { parseBody } from '@/lib/api/parseBody';
import { placeCreateBodySchema } from '@/lib/api/schemas/places';
import { isPlaceCategory } from '@/lib/places/categories';
import { featureMutationRateLimitResponse } from '@/lib/server/rateLimit';
import { createPlace, isValidTimezone } from '@/lib/server/places/create';
import { PLACE_COLUMNS, type PlaceRow } from '@/lib/server/places/loadPlace';
import { requirePlacesUser } from '@/lib/server/places/routeContext';
import { serializeManagerPlace } from '@/lib/server/places/serialize';

/** At most this many Places waiting for review per person, so the queue stays honest. */
const MAX_PENDING = 3;

/**
 * POST /api/places — a business (restaurant, event space, company…) sets up its own Place. It is
 * created `pending` and unlisted with the caller as owner; a Click admin verifies it before it
 * appears on the map. Not gated by the user feature flag (like `GET /api/places/mine`).
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await requirePlacesUser(request, { requireFlag: false });
    if (!ctx.ok) return ctx.response;
    const { admin, user } = ctx;
    const limited = await featureMutationRateLimitResponse('click_places', user.id);
    if (limited) return limited;
    const parsed = await parseBody(request, placeCreateBodySchema);
    if (!parsed.ok) return parsed.response;
    const body = parsed.data;
    if (!isPlaceCategory(body.category)) return apiError('Choose a category.', 400);
    if (!isValidTimezone(body.timezone)) return apiError('Unknown timezone.', 400);

    const { data: owned } = await admin.from('place_managers').select('place_id').eq('user_id', user.id).eq('role', 'owner');
    const ownedIds = ((owned ?? []) as Array<{ place_id: string }>).map((r) => r.place_id);
    if (ownedIds.length > 0) {
      const { count } = await admin
        .from('places')
        .select('id', { count: 'exact', head: true })
        .in('id', ownedIds)
        .in('verification_status', ['draft', 'pending']);
      if ((count ?? 0) >= MAX_PENDING) {
        return NextResponse.json(
          { error: `You have ${MAX_PENDING} Places waiting for review. We'll get to them soon.`, code: 'pending_limit' },
          { status: 409 },
        );
      }
    }

    const result = await createPlace(
      admin,
      {
        name: body.name,
        category: body.category,
        latitude: body.latitude,
        longitude: body.longitude,
        radiusMeters: body.radius_meters ?? 75,
        timezone: body.timezone,
        addressLine: body.address_line || null,
        city: body.city,
        region: body.region || null,
        postalCode: body.postal_code || null,
        countryCode: body.country_code || null,
        websiteUrl: body.website_url || null,
      },
      { ownerId: user.id },
    );
    if ('error' in result) return apiError(result.error, 400);

    const { data: row, error } = await admin.from('places').select(PLACE_COLUMNS).eq('id', result.id).single();
    if (error || !row) throw new Error(error?.message ?? 'created place missing');
    return NextResponse.json({ place: serializeManagerPlace(row as PlaceRow, 'owner') }, { status: 201 });
  } catch (e) {
    console.error('POST /api/places:', e);
    return apiError('Internal Server Error', 500);
  }
}
