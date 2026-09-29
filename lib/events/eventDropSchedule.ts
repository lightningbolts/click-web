import { safeTimeZone, wallClock, zonedWallClockToEpochMs, type WallClock } from '@/lib/events/eventRecurrence';

/**
 * F1 timing, in the event's own timezone:
 *   posting window  event start → midnight at the end of the day the event ends
 *   reveal          `revealHourLocal`:00 (default 10) the next morning, for every drop of the event
 * An event ending exactly at midnight belongs to the day before. DST-safe: wall-clock times are
 * resolved in the zone (a skipped hour lands an hour later, never earlier).
 */
export type EventDropSchedule = { opensAtMs: number; closesAtMs: number; revealAtMs: number };

function nextLocalDay(day: WallClock): WallClock {
  const next = new Date(Date.UTC(day.y, day.mo - 1, day.d + 1));
  return { y: next.getUTCFullYear(), mo: next.getUTCMonth() + 1, d: next.getUTCDate(), h: 0, mi: 0, s: 0 };
}

export function eventDropSchedule(input: {
  startMs: number;
  endMs: number;
  timeZone: string | null | undefined;
  revealHourLocal?: number;
}): EventDropSchedule {
  const zone = safeTimeZone(input.timeZone);
  const dayAfter = nextLocalDay(wallClock(input.endMs - 1, zone));
  return {
    opensAtMs: input.startMs,
    closesAtMs: zonedWallClockToEpochMs(dayAfter, zone),
    revealAtMs: zonedWallClockToEpochMs({ ...dayAfter, h: input.revealHourLocal ?? 10 }, zone),
  };
}

export function isEventDropWindowOpen(schedule: EventDropSchedule, nowMs: number): boolean {
  return nowMs >= schedule.opensAtMs && nowMs < schedule.closesAtMs;
}

export type RecapDrop = { id: string; userId: string; createdAtMs: number; showToAbsentees: boolean };

/** The viewer's own drops first (emphasis), then everyone's in the order they were taken. */
export function orderRecap<T extends RecapDrop>(drops: T[], viewerId: string): T[] {
  const byTime = [...drops].sort((a, b) => a.createdAtMs - b.createdAtMs || a.id.localeCompare(b.id));
  return [...byTime.filter((d) => d.userId === viewerId), ...byTime.filter((d) => d.userId !== viewerId)];
}

/**
 * "What you missed" for people who RSVP'd but never checked in: up to `limit` drops from posters
 * who allow it, taken round-robin across posters so one prolific poster doesn't fill it.
 */
export function selectAbsenteeDrops<T extends RecapDrop>(drops: T[], limit: number): T[] {
  const queues = new Map<string, T[]>();
  for (const drop of [...drops].sort((a, b) => a.createdAtMs - b.createdAtMs || a.id.localeCompare(b.id))) {
    if (!drop.showToAbsentees) continue;
    queues.set(drop.userId, [...(queues.get(drop.userId) ?? []), drop]);
  }
  const picked: T[] = [];
  const lanes = [...queues.values()];
  for (let round = 0; picked.length < limit && lanes.some((lane) => lane.length > round); round += 1) {
    for (const lane of lanes) {
      if (picked.length >= limit) break;
      if (lane[round]) picked.push(lane[round]);
    }
  }
  return picked.sort((a, b) => a.createdAtMs - b.createdAtMs);
}
