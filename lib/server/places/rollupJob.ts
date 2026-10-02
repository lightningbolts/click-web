import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { addDaysToKey, localParts } from '@/lib/places/hours';
import { computePlaceDay } from '@/lib/server/places/dayInputs';
import { placeTimezone } from '@/lib/server/places/serialize';

/** Days re-computed per run: [today − 3, yesterday] in each Place's timezone (idempotent, tolerates late rows). */
const LOOKBACK_DAYS = 3;

/**
 * Daily rollup (§8): upsert `place_daily_stats` for every verified Place. Hourly at pilot scale
 * (≤ 50 Places); past ~500 Places run it once per local day instead.
 */
export async function runPlacesRollup(
  admin: SupabaseClient,
  nowMs: number = Date.now(),
): Promise<{ places: number; days: number; errors: string[] }> {
  const { data, error } = await admin.from('places').select('id, timezone').eq('verification_status', 'verified');
  if (error) throw new Error(`places rollup: ${error.message}`);
  const places = (data ?? []) as Array<{ id: string; timezone: string | null }>;

  let days = 0;
  const errors: string[] = [];
  for (const place of places) {
    const timezone = placeTimezone(place);
    const today = localParts(timezone, nowMs).dateKey;
    for (let offset = LOOKBACK_DAYS; offset >= 1; offset -= 1) {
      const day = addDaysToKey(today, -offset);
      try {
        const stats = await computePlaceDay(admin, { id: place.id, timezone }, day);
        const { error: upsertError } = await admin
          .from('place_daily_stats')
          .upsert({ place_id: place.id, day, ...stats, computed_at: new Date(nowMs).toISOString() }, { onConflict: 'place_id,day' });
        if (upsertError) throw new Error(upsertError.message);
        days += 1;
      } catch (e) {
        errors.push(`${place.id} ${day}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }
  return { places: places.length, days, errors };
}
