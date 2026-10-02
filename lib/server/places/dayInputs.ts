import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { eventEndAtFromMetadata, eventStartAtFromMetadata, parseBeaconMetadata } from '@/lib/events/eventMetadata';
import { addDaysToKey, zonedDayStartMs } from '@/lib/places/hours';
import { rollupPlaceDay, type PlaceDayStats, type RollupCheckIn, type RollupEncounter } from '@/lib/places/rollup';

/**
 * Loads one Place's local-day inputs for `rollupPlaceDay` (§4.9, §8). Insights-eligible rows only
 * (§4.10): check-ins and Pulses with count_for_insights, connections that are handshakes with
 * include_in_business_insights. Shared by the stats route (today, live) and the daily rollup job.
 */

function check(label: string, error: { message: string } | null): void {
  if (error) throw new Error(`place day inputs ${label}: ${error.message}`);
}

export async function computePlaceDay(
  admin: SupabaseClient,
  place: { id: string; timezone: string },
  day: string,
): Promise<PlaceDayStats> {
  const startIso = new Date(zonedDayStartMs(place.timezone, day)).toISOString();
  const endIso = new Date(zonedDayStartMs(place.timezone, addDaysToKey(day, 1))).toISOString();

  const [checkIns, pulses, events, encounters] = await Promise.all([
    admin
      .from('place_check_ins')
      .select('user_id, checked_at, checked_out_at, checkout_reason')
      .eq('place_id', place.id)
      .eq('count_for_insights', true)
      .gte('checked_at', startIso)
      .lt('checked_at', endIso)
      .limit(20000),
    admin
      .from('place_pulses')
      .select('energy, talkable, would_return')
      .eq('place_id', place.id)
      .eq('count_for_insights', true)
      .gte('created_at', startIso)
      .lt('created_at', endIso)
      .limit(20000),
    admin
      .from('map_beacons')
      .select('starts_at, ends_at, expires_at, metadata')
      .eq('beacon_type', 'event')
      .eq('venue_id', place.id)
      .lt('created_at', endIso)
      .limit(1000),
    admin
      .from('connection_encounters')
      .select('connection_id')
      .eq('place_id', place.id)
      .gte('encountered_at', startIso)
      .lt('encountered_at', endIso)
      .limit(20000),
  ]);
  check('check-ins', checkIns.error);
  check('pulses', pulses.error);
  check('events', events.error);
  check('encounters', encounters.error);

  const dayCheckIns = (checkIns.data ?? []) as RollupCheckIn[];
  const dayUsers = [...new Set(dayCheckIns.map((c) => c.user_id))];
  let priorVisitorIds: string[] = [];
  if (dayUsers.length > 0) {
    const { data, error } = await admin
      .from('place_check_ins')
      .select('user_id')
      .eq('place_id', place.id)
      .eq('count_for_insights', true)
      .lt('checked_at', startIso)
      .in('user_id', dayUsers);
    check('prior visitors', error);
    priorVisitorIds = ((data ?? []) as Array<{ user_id: string }>).map((r) => r.user_id);
  }

  const startMs = Date.parse(startIso);
  const endMs = Date.parse(endIso);
  const eventWindows = ((events.data ?? []) as Array<Record<string, unknown>>).flatMap((row) => {
    const meta = parseBeaconMetadata(row.metadata);
    const s = Date.parse(String(row.starts_at ?? eventStartAtFromMetadata(meta) ?? ''));
    const e = Date.parse(String(row.ends_at ?? eventEndAtFromMetadata(meta) ?? row.expires_at ?? ''));
    if (!Number.isFinite(s) || !Number.isFinite(e) || e <= startMs || s >= endMs) return [];
    return [{ starts_at: new Date(s).toISOString(), ends_at: new Date(e).toISOString() }];
  });

  const connectionIds = [...new Set(((encounters.data ?? []) as Array<{ connection_id: string }>).map((r) => r.connection_id))];
  const rollupEncounters: RollupEncounter[] = [];
  if (connectionIds.length > 0) {
    const { data: conns, error } = await admin
      .from('connections')
      .select('id')
      .in('id', connectionIds)
      .eq('include_in_business_insights', true)
      .eq('source', 'handshake');
    check('connections', error);
    const eligible = ((conns ?? []) as Array<{ id: string }>).map((c) => c.id);
    if (eligible.length > 0) {
      const { data: firsts, error: firstErr } = await admin
        .from('connection_encounters')
        .select('connection_id, encountered_at')
        .in('connection_id', eligible)
        .order('encountered_at', { ascending: true })
        .limit(50000);
      check('first encounters', firstErr);
      const first = new Map<string, string>();
      for (const r of (firsts ?? []) as Array<{ connection_id: string; encountered_at: string }>) {
        if (!first.has(r.connection_id)) first.set(r.connection_id, r.encountered_at);
      }
      for (const id of eligible) {
        const at = first.get(id);
        if (at) rollupEncounters.push({ connection_id: id, first_encountered_at: at });
      }
    }
  }

  return rollupPlaceDay({
    day,
    timezone: place.timezone,
    checkIns: dayCheckIns,
    priorVisitorIds,
    pulses: (pulses.data ?? []) as Array<{ energy: number | null; talkable: number | null; would_return: number | null }>,
    eventWindows,
    encounters: rollupEncounters,
  });
}
