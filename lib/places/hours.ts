/**
 * Weekly Place hours (§3.5, §4.8). Times are local to `places.timezone`; a close at or before the
 * open runs past midnight. Uses `Intl.DateTimeFormat` only (no date library).
 */

import { z } from 'zod';
import type { PlaceHours, Weekday } from '@/lib/places/types';

export const WEEKDAYS: readonly Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const intervalSchema = z.tuple([z.string().regex(TIME_RE), z.string().regex(TIME_RE)]);
const hoursSchema = z
  .object({
    mon: z.array(intervalSchema).max(6).optional(),
    tue: z.array(intervalSchema).max(6).optional(),
    wed: z.array(intervalSchema).max(6).optional(),
    thu: z.array(intervalSchema).max(6).optional(),
    fri: z.array(intervalSchema).max(6).optional(),
    sat: z.array(intervalSchema).max(6).optional(),
    sun: z.array(intervalSchema).max(6).optional(),
  })
  .strict();

export function parsePlaceHours(json: unknown): PlaceHours | null {
  if (json == null || typeof json !== 'object' || Array.isArray(json)) return null;
  const parsed = hoursSchema.safeParse(json);
  if (!parsed.success) return null;
  const out: PlaceHours = {};
  for (const day of WEEKDAYS) {
    const intervals = parsed.data[day];
    if (intervals) out[day] = intervals.map(([a, b]) => [a, b] as [string, string]);
  }
  return out;
}

export type LocalParts = { weekday: Weekday; hour: number; minute: number; dateKey: string };

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let f = formatterCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    formatterCache.set(timeZone, f);
  }
  return f;
}

/** Local weekday, hour, minute and `YYYY-MM-DD` for an instant in `timeZone`. */
export function localParts(timeZone: string, ms: number): LocalParts {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = formatterFor(timeZone).formatToParts(new Date(ms));
  } catch {
    parts = formatterFor('UTC').formatToParts(new Date(ms));
  }
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const weekday = get('weekday').slice(0, 3).toLowerCase() as Weekday;
  return {
    weekday,
    hour: Number(get('hour')) % 24,
    minute: Number(get('minute')),
    dateKey: `${get('year')}-${get('month')}-${get('day')}`,
  };
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function previousDay(day: Weekday): Weekday {
  return WEEKDAYS[(WEEKDAYS.indexOf(day) + 6) % 7];
}

export function isOpenAt(hours: PlaceHours | null | undefined, timezone: string, nowMs: number): boolean | null {
  if (!hours) return null;
  const { weekday, hour, minute } = localParts(timezone, nowMs);
  const now = hour * 60 + minute;

  for (const [open, close] of hours[weekday] ?? []) {
    const o = toMinutes(open);
    const c = toMinutes(close);
    if (c > o ? now >= o && now < c : now >= o) return true;
  }
  // Yesterday's intervals that run past midnight.
  for (const [open, close] of hours[previousDay(weekday)] ?? []) {
    const o = toMinutes(open);
    const c = toMinutes(close);
    if (c <= o && now < c) return true;
  }
  return false;
}

function formatClock(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12} ${suffix}` : `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

export function todayHoursLabel(hours: PlaceHours | null | undefined, timezone: string, nowMs: number): string | null {
  if (!hours) return null;
  const { weekday } = localParts(timezone, nowMs);
  const intervals = hours[weekday] ?? [];
  if (intervals.length === 0) return 'Closed today';
  return intervals.map(([open, close]) => `${formatClock(open)} – ${formatClock(close)}`).join(', ');
}

/** The instant the current local day ends in `timezone` (next local midnight, minute precision). */
export function localDayEndMs(timezone: string, nowMs: number): number {
  const { hour, minute } = localParts(timezone, nowMs);
  const flooredNow = nowMs - (nowMs % 60_000);
  return flooredNow + (24 * 60 - (hour * 60 + minute)) * 60_000;
}

/** UTC instant of local midnight starting `dateKey` (`YYYY-MM-DD`) in `timezone`. */
export function zonedDayStartMs(timezone: string, dateKey: string): number {
  const [y, m, d] = dateKey.split('-').map(Number);
  const target = Date.UTC(y, m - 1, d);
  let t = target;
  for (let i = 0; i < 3; i += 1) {
    const p = localParts(timezone, t);
    const [py, pm, pd] = p.dateKey.split('-').map(Number);
    const localAsUtc = Date.UTC(py, pm - 1, pd, p.hour, p.minute);
    const diff = localAsUtc - target;
    if (diff === 0) break;
    t -= diff;
  }
  return t;
}

/** `YYYY-MM-DD` shifted by `days` (calendar arithmetic, timezone-free). */
export function addDaysToKey(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}
