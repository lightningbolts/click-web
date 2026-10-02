import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { eventStartAtFromMetadata, parseBeaconMetadata } from '@/lib/events/eventMetadata';
import { addDaysToKey, localParts, zonedDayStartMs } from '@/lib/places/hours';
import type { PlaceDayStats } from '@/lib/places/rollup';
import { computePlaceDay } from '@/lib/server/places/dayInputs';

/**
 * Manager stats (§5.8). Counts and distributions only: no user ids, names or per-visit
 * timestamps, and no minimum counts (rule 3). Every number uses insights-eligible rows only.
 */

export type StatsRange = 30 | 90;
export type StatsDetail = 'basic' | 'full';

type DailyRow = PlaceDayStats & { day: string };

export type PlaceStats = {
  range_days: number;
  totals: {
    check_ins: number;
    unique_visitors: number;
    repeat_visitor_rate: number | null;
    pulses: number;
    events_hosted: number;
    new_connections: number;
    repeat_connections: number;
  };
  check_ins_by_dow_hour: number[][];
  energy_distribution: number[];
  talkable: { yes: number; no: number };
  would_return: { yes: number; no: number };
  daily?: Array<{ day: string; check_ins: number; unique_visitors: number; pulses: number; avg_energy: number | null }>;
  median_dwell_minutes?: number | null;
  event_vs_regular?: { event_check_ins: number; regular_check_ins: number };
  pulse_by_daypart?: { morning: number[]; afternoon: number[]; evening: number[]; night: number[] };
};

const DAILY_COLUMNS =
  'day, check_ins, unique_visitors, repeat_visitors, check_ins_by_hour, dwell_minutes_sum, dwell_samples, pulses, energy_counts, talkable_yes, talkable_no, would_return_yes, would_return_no, event_check_ins, new_connections, repeat_connections';

/** Undefined-table codes (Postgres / PostgREST): the rollup migration isn't applied yet. */
const MISSING_TABLE_CODES = new Set(['42P01', 'PGRST205']);

function check(label: string, error: { message: string } | null): void {
  if (error) throw new Error(`place stats ${label}: ${error.message}`);
}

/** Monday = 0 … Sunday = 6 for a `YYYY-MM-DD` key. */
function dowIndex(dateKey: string): number {
  const [y, m, d] = dateKey.split('-').map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

function daypart(hour: number): 'morning' | 'afternoon' | 'evening' | 'night' {
  if (hour >= 5 && hour < 11) return 'morning';
  if (hour >= 11 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 22) return 'evening';
  return 'night';
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

export async function loadPlaceStats(
  admin: SupabaseClient,
  place: { id: string; timezone: string },
  options: { range: StatsRange; detail: StatsDetail; nowMs: number },
): Promise<PlaceStats> {
  const { range, detail, nowMs } = options;
  const today = localParts(place.timezone, nowMs).dateKey;
  const firstDay = addDaysToKey(today, -(range - 1));
  const rangeStartIso = new Date(zonedDayStartMs(place.timezone, firstDay)).toISOString();

  const [stored, todayRow, rawCheckIns, events] = await Promise.all([
    admin.from('place_daily_stats').select(DAILY_COLUMNS).eq('place_id', place.id).gte('day', firstDay).lt('day', today),
    computePlaceDay(admin, place, today),
    admin
      .from('place_check_ins')
      .select('user_id, checked_at, checked_out_at, checkout_reason')
      .eq('place_id', place.id)
      .eq('count_for_insights', true)
      .gte('checked_at', rangeStartIso)
      .limit(50000),
    admin
      .from('map_beacons')
      .select('id, starts_at, metadata')
      .eq('beacon_type', 'event')
      .eq('venue_id', place.id)
      .limit(2000),
  ]);
  let storedRows: DailyRow[] = [];
  if (stored.error) {
    if (!MISSING_TABLE_CODES.has((stored.error as { code?: string }).code ?? '')) check('daily', stored.error);
    console.warn('[places/stats] place_daily_stats unavailable; using today only');
  } else {
    storedRows = (stored.data ?? []) as DailyRow[];
  }
  check('raw check-ins', rawCheckIns.error);
  check('events', events.error);

  const days: DailyRow[] = [...storedRows, { ...todayRow, day: today }].sort((a, b) => (a.day < b.day ? -1 : 1));
  const sum = (key: keyof PlaceDayStats) => days.reduce((n, d) => n + (Number(d[key]) || 0), 0);

  const byDowHour = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
  const energy = [0, 0, 0, 0];
  for (const d of days) {
    const dow = dowIndex(d.day);
    (d.check_ins_by_hour ?? []).forEach((n, h) => {
      if (h < 24) byDowHour[dow][h] += Number(n) || 0;
    });
    (d.energy_counts ?? []).forEach((n, i) => {
      if (i < 4) energy[i] += Number(n) || 0;
    });
  }

  const raw = (rawCheckIns.data ?? []) as Array<{ user_id: string; checked_at: string; checked_out_at: string | null; checkout_reason: string | null }>;
  const uniqueVisitors = new Set(raw.map((r) => r.user_id)).size;
  const dailyUniqueSum = sum('unique_visitors');
  const rangeStartMs = Date.parse(rangeStartIso);
  const eventsHosted = ((events.data ?? []) as Array<Record<string, unknown>>).filter((row) => {
    const start = Date.parse(String(row.starts_at ?? eventStartAtFromMetadata(parseBeaconMetadata(row.metadata)) ?? ''));
    return Number.isFinite(start) && start >= rangeStartMs && start <= nowMs;
  }).length;

  const stats: PlaceStats = {
    range_days: range,
    totals: {
      check_ins: sum('check_ins'),
      // Exact distinct visitors over the range, from raw rows (90-day retention covers both ranges).
      unique_visitors: uniqueVisitors,
      // Approximate: Σ daily repeat visitors / Σ daily unique visitors over the range.
      repeat_visitor_rate: dailyUniqueSum > 0 ? Math.round((sum('repeat_visitors') / dailyUniqueSum) * 100) / 100 : null,
      pulses: sum('pulses'),
      events_hosted: eventsHosted,
      new_connections: sum('new_connections'),
      repeat_connections: sum('repeat_connections'),
    },
    check_ins_by_dow_hour: byDowHour,
    energy_distribution: energy,
    talkable: { yes: sum('talkable_yes'), no: sum('talkable_no') },
    would_return: { yes: sum('would_return_yes'), no: sum('would_return_no') },
  };

  if (detail === 'full') {
    const { data: pulseRows, error } = await admin
      .from('place_pulses')
      .select('energy, created_at')
      .eq('place_id', place.id)
      .eq('count_for_insights', true)
      .not('energy', 'is', null)
      .gte('created_at', rangeStartIso)
      .limit(50000);
    check('pulses', error);
    const parts = { morning: [0, 0, 0, 0], afternoon: [0, 0, 0, 0], evening: [0, 0, 0, 0], night: [0, 0, 0, 0] };
    for (const p of (pulseRows ?? []) as Array<{ energy: number; created_at: string }>) {
      if (p.energy < 1 || p.energy > 4) continue;
      parts[daypart(localParts(place.timezone, Date.parse(p.created_at)).hour)][p.energy - 1] += 1;
    }
    const dwell = raw
      .filter((r) => r.checkout_reason === 'user' && r.checked_out_at)
      .map((r) => Math.min(480, Math.round((Date.parse(r.checked_out_at!) - Date.parse(r.checked_at)) / 60_000)))
      .filter((m) => Number.isFinite(m) && m >= 0);
    const eventCheckIns = sum('event_check_ins');

    stats.daily = days.map((d) => {
      const n = (d.energy_counts ?? []).reduce((a, b) => a + (Number(b) || 0), 0);
      const weighted = (d.energy_counts ?? []).reduce((a, b, i) => a + (Number(b) || 0) * (i + 1), 0);
      return {
        day: d.day,
        check_ins: d.check_ins,
        unique_visitors: d.unique_visitors,
        pulses: d.pulses,
        avg_energy: n > 0 ? Math.round((weighted / n) * 100) / 100 : null,
      };
    });
    stats.median_dwell_minutes = median(dwell);
    stats.event_vs_regular = { event_check_ins: eventCheckIns, regular_check_ins: Math.max(0, stats.totals.check_ins - eventCheckIns) };
    stats.pulse_by_daypart = parts;
  }
  return stats;
}
