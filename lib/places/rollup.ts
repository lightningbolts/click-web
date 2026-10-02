/**
 * One `place_daily_stats` row for one Place and one local day (§4.9). Pure. Inputs are already
 * filtered to that Place, that day and insights-eligible rows only (§4.10); this module never
 * sees or returns user identities beyond counting them.
 */

import { localParts } from '@/lib/places/hours';

export type RollupCheckIn = {
  user_id: string;
  checked_at: string;
  checked_out_at: string | null;
  checkout_reason: string | null;
};

export type RollupPulse = { energy: number | null; talkable: number | null; would_return: number | null };

export type RollupEventWindow = { starts_at: string; ends_at: string };

/** One handshake connection seen at the Place that day, with its earliest encounter anywhere. */
export type RollupEncounter = { connection_id: string; first_encountered_at: string };

export type PlaceDayStats = {
  check_ins: number;
  unique_visitors: number;
  repeat_visitors: number;
  check_ins_by_hour: number[];
  dwell_minutes_sum: number;
  dwell_samples: number;
  pulses: number;
  energy_counts: number[];
  talkable_yes: number;
  talkable_no: number;
  would_return_yes: number;
  would_return_no: number;
  event_check_ins: number;
  new_connections: number;
  repeat_connections: number;
};

const MAX_DWELL_MINUTES = 480;

export function rollupPlaceDay(input: {
  day: string;
  timezone: string;
  checkIns: RollupCheckIn[];
  priorVisitorIds: Iterable<string>;
  pulses: RollupPulse[];
  eventWindows: RollupEventWindow[];
  encounters: RollupEncounter[];
}): PlaceDayStats {
  const prior = new Set(input.priorVisitorIds);
  const byHour = Array.from({ length: 24 }, () => 0);
  const visitors = new Set<string>();
  let dwellSum = 0;
  let dwellSamples = 0;
  let eventCheckIns = 0;
  const windows = input.eventWindows
    .map((w) => [Date.parse(w.starts_at), Date.parse(w.ends_at)] as const)
    .filter(([s, e]) => Number.isFinite(s) && Number.isFinite(e));

  for (const c of input.checkIns) {
    const at = Date.parse(c.checked_at);
    if (!Number.isFinite(at)) continue;
    visitors.add(c.user_id);
    byHour[localParts(input.timezone, at).hour] += 1;
    if (c.checkout_reason === 'user' && c.checked_out_at) {
      const out = Date.parse(c.checked_out_at);
      if (Number.isFinite(out) && out >= at) {
        dwellSum += Math.min(MAX_DWELL_MINUTES, Math.round((out - at) / 60_000));
        dwellSamples += 1;
      }
    }
    if (windows.some(([s, e]) => at >= s && at <= e)) eventCheckIns += 1;
  }

  const energyCounts = [0, 0, 0, 0];
  let pulses = 0;
  let talkableYes = 0;
  let talkableNo = 0;
  let wouldReturnYes = 0;
  let wouldReturnNo = 0;
  for (const p of input.pulses) {
    if (p.energy != null && p.energy >= 1 && p.energy <= 4) {
      pulses += 1;
      energyCounts[p.energy - 1] += 1;
    }
    if (p.talkable === 1) talkableYes += 1;
    else if (p.talkable === 0) talkableNo += 1;
    if (p.would_return === 1) wouldReturnYes += 1;
    else if (p.would_return === 0) wouldReturnNo += 1;
  }

  const firstByConnection = new Map<string, string>();
  for (const e of input.encounters) {
    const prev = firstByConnection.get(e.connection_id);
    if (!prev || e.first_encountered_at < prev) firstByConnection.set(e.connection_id, e.first_encountered_at);
  }
  let newConnections = 0;
  let repeatConnections = 0;
  for (const first of firstByConnection.values()) {
    const firstDay = localParts(input.timezone, Date.parse(first)).dateKey;
    if (firstDay === input.day) newConnections += 1;
    else repeatConnections += 1;
  }

  return {
    check_ins: input.checkIns.length,
    unique_visitors: visitors.size,
    repeat_visitors: [...visitors].filter((id) => prior.has(id)).length,
    check_ins_by_hour: byHour,
    dwell_minutes_sum: dwellSum,
    dwell_samples: dwellSamples,
    pulses,
    energy_counts: energyCounts,
    talkable_yes: talkableYes,
    talkable_no: talkableNo,
    would_return_yes: wouldReturnYes,
    would_return_no: wouldReturnNo,
    event_check_ins: eventCheckIns,
    new_connections: newConnections,
    repeat_connections: repeatConnections,
  };
}
