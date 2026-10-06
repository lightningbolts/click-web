import 'server-only';

import { displayNameFromUser, type UserProfileRow } from '@/lib/events/attendeeDirectory';
import type { PlaceDetail } from '@/lib/places/types';
import { placesConfigFrom } from '@/lib/places/config';
import { createAdminSupabaseClient } from '@/lib/server/admin/supabaseAdmin';
import { resolveFeature } from '@/lib/server/featureFlags';
import { buildPublicDetail } from '@/lib/server/places/detail';
import { loadConsumerPlace } from '@/lib/server/places/loadPlace';
import { countRecentPlaceEventRsvps, loadPlaceEvents, type PlaceEventItem } from '@/lib/server/places/placeEvents';
import { loadPlaceStats, type PlaceStats } from '@/lib/server/places/stats';

export type PlaceOverview = {
  /** Null when the read failed: the page shows a retry row, never zeros. */
  stats: PlaceStats | null;
  eventRsvps: number | null;
  upcoming: PlaceEventItem[] | null;
  hasEvent: boolean;
  team: { count: number; people: { id: string; name: string; avatarUrl: string | null }[] };
  now: PlaceDetail | null;
};

async function soft<T>(label: string, fallback: T, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (e) {
    console.error(`[place overview] ${label}:`, e instanceof Error ? e.message : e);
    return fallback;
  }
}

/** Everything the Place Overview shows (spec §9.5), in one parallel round. */
export async function loadPlaceOverview(
  place: { id: string; timezone: string },
  userId: string,
  nowMs: number,
): Promise<PlaceOverview> {
  const admin = createAdminSupabaseClient();
  const [stats, eventRsvps, upcoming, anyEvent, team, now] = await Promise.all([
    soft('stats', null, () => loadPlaceStats(admin, place, { range: 30, detail: 'basic', nowMs })),
    soft('rsvps', null, () => countRecentPlaceEventRsvps(admin, place.id, nowMs)),
    soft('upcoming', null, () => loadPlaceEvents(admin, place.id, { when: 'upcoming', nowMs, limit: 3 })),
    soft('any event', false, async () => {
      const { count } = await admin.from('map_beacons').select('id', { count: 'exact', head: true }).eq('venue_id', place.id).eq('beacon_type', 'event');
      return (count ?? 0) > 0;
    }),
    soft('team', { count: 0, people: [] as PlaceOverview['team']['people'] }, async () => {
      const { data } = await admin.from('place_managers').select('user_id').eq('place_id', place.id);
      const ids = ((data ?? []) as Array<{ user_id: string }>).map((r) => r.user_id);
      const { data: users } = ids.length
        ? await admin.from('users').select('id, name, image, first_name, last_name').in('id', ids.slice(0, 4))
        : { data: [] };
      return {
        count: ids.length,
        people: ((users ?? []) as UserProfileRow[]).map((u) => ({ id: u.id, name: displayNameFromUser(u, 'Manager'), avatarUrl: u.image })),
      };
    }),
    // "Now" only where Click Places is on and the Place is live on the map.
    soft('now', null, async () => {
      const feature = await resolveFeature(admin, 'click_places', userId);
      if (!feature.enabled) return null;
      const consumer = await loadConsumerPlace(admin, place.id);
      return consumer ? buildPublicDetail(admin, consumer, placesConfigFrom(feature.config), nowMs) : null;
    }),
  ]);
  return { stats, eventRsvps, upcoming, hasEvent: anyEvent, team, now };
}
