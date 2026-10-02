import { NextRequest, NextResponse } from 'next/server';
import { apiError } from '@/lib/api/errors';
import { PLACE_COLUMNS, type PlaceRow } from '@/lib/server/places/loadPlace';
import { requirePlacesUser } from '@/lib/server/places/routeContext';
import { serializeManagerPlace, type ManagerPlace } from '@/lib/server/places/serialize';

/** GET /api/places/mine — Places the caller manages (§5.7). Not gated by the user feature flag. */
export async function GET(request: NextRequest) {
  try {
    const ctx = await requirePlacesUser(request, { requireFlag: false });
    if (!ctx.ok) return ctx.response;
    const { admin, user } = ctx;

    const { data: memberships, error } = await admin.from('place_managers').select('place_id, role').eq('user_id', user.id);
    if (error) throw new Error(error.message);
    const roles = new Map(((memberships ?? []) as Array<{ place_id: string; role: ManagerPlace['role'] }>).map((m) => [m.place_id, m.role]));
    if (roles.size === 0) return NextResponse.json({ places: [] });

    const { data: rows, error: placesError } = await admin.from('places').select(PLACE_COLUMNS).in('id', [...roles.keys()]);
    if (placesError) throw new Error(placesError.message);
    const places = ((rows ?? []) as PlaceRow[])
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((p) => serializeManagerPlace(p, roles.get(p.id)!));
    return NextResponse.json({ places });
  } catch (e) {
    console.error('GET /api/places/mine:', e);
    return apiError('Internal Server Error', 500);
  }
}
