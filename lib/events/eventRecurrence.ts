import { isRecord } from "@/lib/events/eventMetadata";

/**
 * Repeating events. `POST /api/beacons` materializes every occurrence as its own event row
 * (own hub, RSVPs, check-ins) sharing `series_id`, so the rest of the event stack needs no
 * recurrence awareness. Wire shape: `recurrence: { frequency, count }`, `count` = total
 * occurrences including the first.
 */
export const EVENT_RECURRENCE_FREQUENCIES = ["daily", "weekly", "biweekly", "monthly"] as const;
export type EventRecurrenceFrequency = (typeof EVENT_RECURRENCE_FREQUENCIES)[number];

export type EventRecurrence = { frequency: EventRecurrenceFrequency; count: number };

export const MIN_EVENT_OCCURRENCES = 2;
export const MAX_EVENT_OCCURRENCES = 26;

export const EVENT_RECURRENCE_LABELS: Record<EventRecurrenceFrequency, string> = {
  daily: "Daily",
  weekly: "Weekly",
  biweekly: "Every 2 weeks",
  monthly: "Monthly",
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** Shortest gap between two occurrences; an occurrence must end by the next start. */
const MIN_INTERVAL_MS: Record<EventRecurrenceFrequency, number> = {
  daily: DAY_MS,
  weekly: 7 * DAY_MS,
  biweekly: 14 * DAY_MS,
  monthly: 28 * DAY_MS,
};

/** `null` = a one-off event (field absent, null, or `frequency: "none"`). */
export function parseEventRecurrenceFromBody(
  body: Record<string, unknown>,
): { recurrence: EventRecurrence | null } | { error: string } {
  const raw = body.recurrence;
  if (raw == null) return { recurrence: null };
  if (!isRecord(raw)) return { error: "recurrence must be an object." };
  const frequency = typeof raw.frequency === "string" ? raw.frequency.trim().toLowerCase() : "";
  if (frequency === "" || frequency === "none") return { recurrence: null };
  if (!(EVENT_RECURRENCE_FREQUENCIES as readonly string[]).includes(frequency)) {
    return { error: "recurrence.frequency must be daily, weekly, biweekly, or monthly." };
  }
  const count = typeof raw.count === "number" ? raw.count : Number(raw.count);
  if (!Number.isInteger(count) || count < MIN_EVENT_OCCURRENCES || count > MAX_EVENT_OCCURRENCES) {
    return {
      error: `recurrence.count must be a whole number from ${MIN_EVENT_OCCURRENCES} to ${MAX_EVENT_OCCURRENCES}.`,
    };
  }
  return { recurrence: { frequency: frequency as EventRecurrenceFrequency, count } };
}

export function safeTimeZone(timeZone: string | null | undefined): string {
  if (timeZone) {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone });
      return timeZone;
    } catch {
      /* unknown zone */
    }
  }
  return "UTC";
}

export type WallClock = { y: number; mo: number; d: number; h: number; mi: number; s: number };

export function wallClock(epochMs: number, timeZone: string): WallClock {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  }).formatToParts(new Date(epochMs));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { y: get("year"), mo: get("month"), d: get("day"), h: get("hour"), mi: get("minute"), s: get("second") };
}

/** Zone offset (ms, local minus UTC) at an instant. */
function zoneOffsetMs(epochMs: number, timeZone: string): number {
  const w = wallClock(epochMs, timeZone);
  return Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi, w.s) - Math.floor(epochMs / 1000) * 1000;
}

/** The instant a wall-clock time occurs in `timeZone` (a time skipped by DST lands an hour off). */
export function zonedWallClockToEpochMs(w: WallClock, timeZone: string): number {
  const asUtc = Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi, w.s);
  const guess = asUtc - zoneOffsetMs(asUtc, timeZone);
  return asUtc - zoneOffsetMs(guess, timeZone);
}

function daysInMonth(year: number, month1: number): number {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate();
}

/**
 * Every occurrence's `[start, end]`, first one unchanged. Starts keep the same local clock time
 * in `timeZone` across DST changes; monthly keeps the day of month (clamped to shorter months,
 * always measured from the first start so Jan 31 → Feb 28 → Mar 31). Durations are preserved.
 */
export function expandEventOccurrences(
  schedule: { startEpochMs: number; endEpochMs: number },
  recurrence: EventRecurrence | null,
  timeZone?: string | null,
): { startEpochMs: number; endEpochMs: number }[] {
  const durationMs = schedule.endEpochMs - schedule.startEpochMs;
  if (recurrence == null) return [{ ...schedule }];
  const zone = safeTimeZone(timeZone);
  const base = wallClock(schedule.startEpochMs, zone);
  const subSecondMs = schedule.startEpochMs - Math.floor(schedule.startEpochMs / 1000) * 1000;
  const out: { startEpochMs: number; endEpochMs: number }[] = [];
  for (let i = 0; i < recurrence.count; i += 1) {
    let target: WallClock;
    if (recurrence.frequency === "monthly") {
      const monthStart = new Date(Date.UTC(base.y, base.mo - 1 + i, 1));
      const y = monthStart.getUTCFullYear();
      const mo = monthStart.getUTCMonth() + 1;
      target = { ...base, y, mo, d: Math.min(base.d, daysInMonth(y, mo)) };
    } else {
      const stepDays = recurrence.frequency === "daily" ? 1 : recurrence.frequency === "weekly" ? 7 : 14;
      const day = new Date(Date.UTC(base.y, base.mo - 1, base.d + i * stepDays));
      target = { ...base, y: day.getUTCFullYear(), mo: day.getUTCMonth() + 1, d: day.getUTCDate() };
    }
    const startEpochMs =
      i === 0 ? schedule.startEpochMs : zonedWallClockToEpochMs(target, zone) + subSecondMs;
    out.push({ startEpochMs, endEpochMs: startEpochMs + durationMs });
  }
  return out;
}

/** Occurrences may not overlap: each must end by the time the next can start. */
export function validateEventRecurrence(
  schedule: { startEpochMs: number; endEpochMs: number },
  recurrence: EventRecurrence | null,
): string | null {
  if (recurrence == null) return null;
  if (schedule.endEpochMs - schedule.startEpochMs > MIN_INTERVAL_MS[recurrence.frequency]) {
    return "A repeating event must end before the next one starts.";
  }
  return null;
}
