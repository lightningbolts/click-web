import { NextRequest, NextResponse } from 'next/server';
import { apiError } from '@/lib/api/errors';
import { enrichPlaces, loadViewerConnections } from '@/lib/server/places/enrich';
import { isConsumerPlace, PLACE_COLUMNS, type PlaceRow } from '@/lib/server/places/loadPlace';
import { requirePlacesUser } from '@/lib/server/places/routeContext';
import { serializePlaceSummary } from '@/lib/server/places/serialize';

const MAX_PLACES = 50;
const CHECK_IN_RETENTION_DAYS = 90;

type Activity = { check_in_count: number; last_check_in_at: string | null; encounter_count: number; last_at: string };

/** GET /api/me/places — the viewer's own Place history (§5.6). Listed Places only. */
export async function GET(request: NextRequest) {
  try {
    const ctx = await requirePlacesUser(request);
    if (!ctx.ok) return ctx.response;
    const { admin, user, config } = ctx;
    const nowMs = Date.now();
    const sinceIso = new Date(nowMs - CHECK_IN_RETENTION_DAYS * 86_400_000).toISOString();

    const [checkIns, connections] = await Promise.all([
      admin
        .from('place_check_ins')
        .select('place_id, checked_at')
        .eq('user_id', user.id)
        .gte('checked_at', sinceIso)
        .order('checked_at', { ascending: false })
        .limit(2000),
      loadViewerConnections(admin, user.id),
    ]);
    if (checkIns.error) throw new Error(checkIns.error.message);

    const activity = new Map<string, Activity>();
    const touch = (placeId: string) => {
      let a = activity.get(placeId);
      if (!a) {
        a = { check_in_count: 0, last_check_in_at: null, encounter_count: 0, last_at: '' };
        activity.set(placeId, a);
      }
      return a;
    };
    for (const row of (checkIns.data ?? []) as Array<{ place_id: string; checked_at: string }>) {
      const a = touch(row.place_id);
      a.check_in_count += 1;
      if (!a.last_check_in_at || a.last_check_in_at < row.checked_at) a.last_check_in_at = row.checked_at;
      if (a.last_at < row.checked_at) a.last_at = row.checked_at;
    }

    const connectionIds = [...connections.keys()];
    if (connectionIds.length > 0) {
      const { data, error } = await admin
        .from('connection_encounters')
        .select('place_id, encountered_at, reporting_user_id')
        .in('connection_id', connectionIds)
        .not('place_id', 'is', null)
        .order('encountered_at', { ascending: false })
        .limit(2000);
      if (error) throw new Error(error.message);
      for (const row of (data ?? []) as Array<{ place_id: string; encountered_at: string; reporting_user_id: string | null }>) {
        if (row.reporting_user_id != null && row.reporting_user_id !== user.id) continue;
        const a = touch(row.place_id);
        a.encounter_count += 1;
        if (a.last_at < row.encountered_at) a.last_at = row.encountered_at;
      }
    }
    if (activity.size === 0) return NextResponse.json({ places: [] });

    const { data: rows, error } = await admin.from('places').select(PLACE_COLUMNS).in('id', [...activity.keys()]);
    if (error) throw new Error(error.message);
    const places = ((rows ?? []) as PlaceRow[])
      .filter(isConsumerPlace)
      .sort((a, b) => (activity.get(b.id)!.last_at < activity.get(a.id)!.last_at ? -1 : 1))
      .slice(0, MAX_PLACES);

    const { enrichments } = await enrichPlaces(admin, places, { viewerId: user.id, config, nowMs });
    return NextResponse.json({
      places: places.map((p) => {
        const a = activity.get(p.id)!;
        return {
          place: serializePlaceSummary(p, enrichments.get(p.id)!, { distanceMeters: null, nowMs }),
          check_in_count: a.check_in_count,
          last_check_in_at: a.last_check_in_at,
          encounter_count: a.encounter_count,
        };
      }),
    });
  } catch (e) {
    console.error('GET /api/me/places:', e);
    return apiError('Internal Server Error', 500);
  }
}
