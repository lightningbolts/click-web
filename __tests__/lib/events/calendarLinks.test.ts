import { calendarEventFor, googleCalendarUrl, icsFile, outlookCalendarUrl, type CalendarEvent } from '@/lib/events/calendarLinks';
import { publicEventFixture } from '../../helpers/publicEventFixture';

const ev: CalendarEvent = {
  id: '11111111-2222-3333-4444-555555555555',
  title: 'Jazz, wine; and \\ friends',
  startAt: '2026-10-08T01:00:00Z',
  endAt: '2026-10-08T03:00:00Z',
  location: 'The Lantern, SF',
  description: 'Bring a friend.\nNo cover.',
  url: 'https://click.example/e/1111',
};

describe('calendar links', () => {
  it('builds a Google template URL in UTC', () => {
    const url = new URL(googleCalendarUrl(ev)!);
    expect(url.searchParams.get('dates')).toBe('20261008T010000Z/20261008T030000Z');
    expect(url.searchParams.get('text')).toBe(ev.title);
    expect(url.searchParams.get('location')).toBe('The Lantern, SF');
    expect(url.searchParams.get('details')).toContain('https://click.example/e/1111');
  });

  it('builds an Outlook compose URL', () => {
    const url = new URL(outlookCalendarUrl(ev)!);
    expect(url.searchParams.get('startdt')).toBe('2026-10-08T01:00:00.000Z');
    expect(url.searchParams.get('subject')).toBe(ev.title);
  });

  it('defaults to two hours when the end is missing or before the start', () => {
    const url = new URL(googleCalendarUrl({ ...ev, endAt: '2026-10-07T00:00:00Z' })!);
    expect(url.searchParams.get('dates')).toBe('20261008T010000Z/20261008T030000Z');
  });

  it('returns nothing for undated events', () => {
    expect(googleCalendarUrl({ ...ev, startAt: null })).toBeNull();
    expect(outlookCalendarUrl({ ...ev, startAt: null })).toBeNull();
    expect(icsFile({ ...ev, startAt: null }, 0)).toBeNull();
  });

  it('writes a valid, escaped, folded .ics file', () => {
    const ics = icsFile({ ...ev, description: 'x'.repeat(200) }, Date.parse('2026-10-06T00:00:00Z'))!;
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics).toContain('SUMMARY:Jazz\\, wine\\; and \\\\ friends');
    expect(ics).toContain('LOCATION:The Lantern\\, SF');
    expect(ics).toContain('DTSTAMP:20261006T000000Z');
    for (const line of ics.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    // Unfolding restores the description.
    expect(ics.replace(/\r\n /g, '')).toContain(`DESCRIPTION:${'x'.repeat(200)}`);
  });

  it('escapes newlines in descriptions', () => {
    expect(icsFile(ev, 0)).toContain('DESCRIPTION:Bring a friend.\\nNo cover.\\n\\nhttps://click.example/e/1111');
  });
});

describe('calendarEventFor', () => {
  it('locates by name, then the street address that routes', () => {
    expect(calendarEventFor(publicEventFixture(), 'Jazz').location).toBe('Cafe Allegro, 4214 University Way NE');
    expect(calendarEventFor(publicEventFixture({ address: 'Cafe Allegro' }), 'Jazz').location).toBe('Cafe Allegro');
    expect(calendarEventFor(publicEventFixture({ location_name: null, address: null }), 'Jazz').location).toBeNull();
  });
});
