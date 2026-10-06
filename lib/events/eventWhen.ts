/**
 * The event page's When row (spec §7.6.2): "Wednesday, October 7" over "6:00 – 8:00 PM PDT",
 * in the viewer's zone, plus the event's own zone when it differs ("9:00 – 11:00 PM EDT local").
 */
export type EventWhenLines = {
  month: string;
  day: string;
  dateLine: string;
  timeLine: string;
  /** The same range in the event's zone, when that zone shows a different clock time. */
  eventLocal: string | null;
};

function sameDay(a: number, b: number, timeZone: string): boolean {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  return f.format(a) === f.format(b);
}

function timeRange(start: number, end: number | null, timeZone: string): string {
  const opts: Intl.DateTimeFormatOptions = { timeZone, hour: 'numeric', minute: '2-digit', timeZoneName: 'short' };
  if (end == null) return new Intl.DateTimeFormat('en-US', opts).format(start);
  if (!sameDay(start, end, timeZone)) {
    const withDay = new Intl.DateTimeFormat('en-US', { ...opts, month: 'short', day: 'numeric' });
    const startOnly = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' });
    return `${startOnly.format(start)} – ${withDay.format(end)}`;
  }
  return new Intl.DateTimeFormat('en-US', opts).formatRange(start, end);
}

export function eventWhenLines(
  startAt: string | null,
  endAt: string | null,
  viewerTimeZone: string,
  eventTimeZone: string | null,
): EventWhenLines | null {
  const start = Date.parse(startAt ?? '');
  if (!Number.isFinite(start)) return null;
  const endRaw = Date.parse(endAt ?? '');
  const end = Number.isFinite(endRaw) && endRaw > start ? endRaw : null;
  const tz = viewerTimeZone;
  const month = new Intl.DateTimeFormat('en-US', { timeZone: tz, month: 'short' }).format(start);
  const day = new Intl.DateTimeFormat('en-US', { timeZone: tz, day: 'numeric' }).format(start);
  const nowYear = new Date().getUTCFullYear();
  const startYear = Number(new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric' }).format(start));
  const dateLine = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    ...(startYear !== nowYear ? { year: 'numeric' } : {}),
  }).format(start);
  const timeLine = timeRange(start, end, tz);
  let eventLocal: string | null = null;
  if (eventTimeZone && eventTimeZone !== tz) {
    try {
      const local = timeRange(start, end, eventTimeZone);
      if (local !== timeLine) eventLocal = `${local} local`;
    } catch {
      // Unknown zone name: show the viewer's time only.
    }
  }
  return { month, day, dateLine, timeLine, eventLocal };
}
