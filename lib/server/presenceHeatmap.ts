import 'server-only';

import { unstable_cache } from 'next/cache';
import { createAdminSupabaseClient } from '@/lib/server/admin/supabaseAdmin';
import { runtimeEnvPresent } from '@/lib/server/runtimeEnv';
import {
  EMPTY_PRESENCE_HEATMAP,
  parseConnectionLatLng,
  toPresenceCells,
  type PresenceHeatmapPayload,
} from '@/lib/landing/presenceHeatmap';

const PAGE_SIZE = 1000;
const MAX_ROWS = 10_000;

type AdminClient = ReturnType<typeof createAdminSupabaseClient>;

async function loadPointsFromEncounters(admin: AdminClient): Promise<{ lat: number; lng: number }[] | 'missing'> {
  const points: { lat: number; lng: number }[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE_SIZE) {
    const { data, error } = await admin
      .from('connection_encounters')
      .select('gps_lat, gps_lon')
      .not('gps_lat', 'is', null)
      .not('gps_lon', 'is', null)
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      const missing = /does not exist|schema cache/i.test(error.message);
      if (missing && from === 0) return 'missing';
      console.error('[presence-heatmap] encounters query failed:', error.message);
      break;
    }
    if (!data?.length) break;
    for (const row of data) {
      const parsed = parseConnectionLatLng({
        lat: (row as { gps_lat?: unknown }).gps_lat,
        lon: (row as { gps_lon?: unknown }).gps_lon,
      });
      if (parsed) points.push(parsed);
    }
    if (data.length < PAGE_SIZE) break;
  }
  return points;
}

async function loadPointsFromConnections(admin: AdminClient): Promise<{ lat: number; lng: number }[]> {
  const points: { lat: number; lng: number }[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE_SIZE) {
    const { data, error } = await admin
      .from('connections')
      .select('geo_location')
      .not('geo_location', 'is', null)
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      console.error('[presence-heatmap] connections query failed:', error.message);
      break;
    }
    if (!data?.length) break;
    for (const row of data) {
      const parsed = parseConnectionLatLng((row as { geo_location?: unknown }).geo_location);
      if (parsed) points.push(parsed);
    }
    if (data.length < PAGE_SIZE) break;
  }
  return points;
}

/**
 * One Postgres scan per revalidate window, then the landing SSR payload
 * carries the cells. No extra Worker round-trip from the browser.
 *
 * Live schema stores GPS on `connection_encounters` (`connections.geo_location`
 * was dropped). Older databases still have the JSON column — try that next.
 */
async function loadPresenceHeatmapUncached(): Promise<PresenceHeatmapPayload> {
  if (!runtimeEnvPresent('NEXT_PUBLIC_SUPABASE_URL') || !runtimeEnvPresent('SUPABASE_SERVICE_ROLE_KEY')) {
    return { ...EMPTY_PRESENCE_HEATMAP, generatedAt: new Date().toISOString() };
  }

  const admin = createAdminSupabaseClient();
  const fromEncounters = await loadPointsFromEncounters(admin);
  const points = fromEncounters === 'missing' ? await loadPointsFromConnections(admin) : fromEncounters;

  return {
    cells: toPresenceCells(points),
    generatedAt: new Date().toISOString(),
  };
}

export function loadPresenceHeatmap(): Promise<PresenceHeatmapPayload> {
  return unstable_cache(loadPresenceHeatmapUncached, ['landing-presence-heatmap-v3'], {
    revalidate: 3600,
  })();
}
