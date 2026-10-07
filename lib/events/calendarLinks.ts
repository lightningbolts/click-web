import { eventDescriptionPlainText, eventWhereLabel } from '@/lib/events/eventMetadata';
import type { PublicEventPayload } from '@/lib/events/publicEvent';
import { eventShareUrl, publicOrigin } from '@/lib/events/eventUrls';

/** "Add to calendar" targets for an event (spec §7.6.2): Google, Outlook and an .ics file. */
export type CalendarEvent = {
  id: string;
  title: string;
  startAt: string | null;
  endAt: string | null;
  location: string | null;
  description: string | null;
  url: string;
};

/** One event's calendar entry, from its public payload and display title. */
export function calendarEventFor(event: PublicEventPayload, title: string): CalendarEvent {
  const where = eventWhereLabel(event.location_name);
  const address = event.address?.trim() || null;
  return {
    id: event.beacon_id,
    title,
    startAt: event.event_start_at,
    endAt: event.event_end_at,
    // "Cafe Allegro, 4214 University Way NE": the name, then the street address that routes.
    location: [where, address && address !== where ? address : null].filter(Boolean).join(', ') || null,
    description: eventDescriptionPlainText(event.description),
    url: eventShareUrl(event.beacon_id, publicOrigin()),
  };
}

const TWO_HOURS = 2 * 3_600_000;

function range(e: CalendarEvent): { start: Date; end: Date } | null {
  const start = Date.parse(e.startAt ?? '');
  if (!Number.isFinite(start)) return null;
  const end = Date.parse(e.endAt ?? '');
  return { start: new Date(start), end: new Date(Number.isFinite(end) && end > start ? end : start + TWO_HOURS) };
}

/** 20261007T010000Z */
function utcStamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function details(e: CalendarEvent): string {
  return [e.description?.trim(), e.url].filter(Boolean).join('\n\n');
}

export function googleCalendarUrl(e: CalendarEvent): string | null {
  const r = range(e);
  if (!r) return null;
  const p = new URLSearchParams({
    action: 'TEMPLATE',
    text: e.title,
    dates: `${utcStamp(r.start)}/${utcStamp(r.end)}`,
    details: details(e),
  });
  if (e.location) p.set('location', e.location);
  return `https://calendar.google.com/calendar/render?${p}`;
}

export function outlookCalendarUrl(e: CalendarEvent): string | null {
  const r = range(e);
  if (!r) return null;
  const p = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: e.title,
    startdt: r.start.toISOString(),
    enddt: r.end.toISOString(),
    body: details(e),
  });
  if (e.location) p.set('location', e.location);
  return `https://outlook.live.com/calendar/0/deeplink/compose?${p}`;
}

/** RFC 5545 TEXT escaping. */
function icsText(v: string): string {
  return v.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (c) => `\\${c}`);
}

/** RFC 5545 lines fold at 75 octets; continuation lines start with a space. */
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let chunk = '';
  let size = 0;
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length;
    if (size + n > (out.length ? 74 : 75)) {
      out.push(chunk);
      chunk = '';
      size = 0;
    }
    chunk += ch;
    size += n;
  }
  out.push(chunk);
  return out.join('\r\n ');
}

export function icsFile(e: CalendarEvent, nowMs: number): string | null {
  const r = range(e);
  if (!r) return null;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Click//Events//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${e.id}@click`,
    `DTSTAMP:${utcStamp(new Date(nowMs))}`,
    `DTSTART:${utcStamp(r.start)}`,
    `DTEND:${utcStamp(r.end)}`,
    `SUMMARY:${icsText(e.title)}`,
    ...(e.location ? [`LOCATION:${icsText(e.location)}`] : []),
    `DESCRIPTION:${icsText(details(e))}`,
    `URL:${e.url}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return `${lines.map(fold).join('\r\n')}\r\n`;
}
