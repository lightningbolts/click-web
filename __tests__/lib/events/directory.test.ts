import {
  buildEventDirectory,
  DIRECTORY_PAGE_SIZE,
  directoryHref,
  parseDirectoryQuery,
  type DirectoryQuery,
} from '@/lib/events/directory';
import type { PublicEventListItem } from '@/lib/events/publicEvent';

const NOW = Date.parse('2026-10-06T15:00:00Z');
const H = 3_600_000;
const D = 24 * H;
const TZ = 'America/New_York';
const iso = (ms: number) => new Date(ms).toISOString();

let n = 0;
const ev = (over: Partial<PublicEventListItem> = {}): PublicEventListItem => ({
  beacon_id: `e${++n}`,
  title: `Event ${n}`,
  description: null,
  image_url: null,
  host_name: null,
  host_avatar_url: null,
  event_start_at: iso(NOW + 2 * H),
  event_end_at: null,
  location_name: null,
  latitude: null,
  longitude: null,
  rsvp_count: 0,
  rsvp_enabled: true,
  cover_theme_id: null,
  visual_seed: '',
  attendees: [],
  timezone: null,
  place: null,
  ...over,
});
const q = (over: Partial<DirectoryQuery> = {}): DirectoryQuery => ({ tab: 'upcoming', q: '', sort: 'date', page: 1, ...over });
const build = (items: PublicEventListItem[], over: Partial<DirectoryQuery> = {}) =>
  buildEventDirectory(items, q(over), { timeZone: TZ, nowMs: NOW });

describe('parseDirectoryQuery / directoryHref', () => {
  it('falls back to defaults for unknown values', () => {
    expect(parseDirectoryQuery({ tab: 'nope', sort: 'x', page: '-3' })).toEqual(q());
    expect(parseDirectoryQuery({ tab: 'past', sort: 'going', page: '2', q: [' jazz ', 'x'] })).toEqual(
      q({ tab: 'past', sort: 'going', page: 2, q: 'jazz' }),
    );
    expect(parseDirectoryQuery({ page: '9999' }).page).toBe(50);
  });

  it('omits defaults and round-trips', () => {
    expect(directoryHref(q())).toBe('/events');
    const href = directoryHref(q({ tab: 'past', q: 'jazz club', sort: 'host', page: 3 }));
    expect(href).toBe('/events?tab=past&q=jazz+club&sort=host&page=3');
    const params = Object.fromEntries(new URL(href, 'https://x').searchParams);
    expect(parseDirectoryQuery(params)).toEqual(q({ tab: 'past', q: 'jazz club', sort: 'host', page: 3 }));
  });
});

describe('buildEventDirectory', () => {
  it('groups upcoming events by viewer day, ascending, with relative titles', () => {
    const later = ev({ event_start_at: iso(NOW + 9 * D) });
    const today = ev({ event_start_at: iso(NOW + 2 * H) });
    const tomorrow = ev({ event_start_at: iso(NOW + D) });
    const tba = ev({ event_start_at: null });
    const dir = build([later, tba, tomorrow, today]);
    expect(dir.days.map((d) => d.title)).toEqual(['Today', 'Tomorrow', 'Oct 15', 'Date to be announced']);
    expect(dir.days[0].subtitle).toBe('Tuesday');
    expect(dir.days[3].subtitle).toBeNull();
    expect(dir.featured).toBeNull();
  });

  it('sorts past events newest first and labels yesterday', () => {
    const old = ev({ event_start_at: iso(NOW - 20 * D) });
    const yesterday = ev({ event_start_at: iso(NOW - D) });
    const dir = build([old, yesterday], { tab: 'past' });
    expect(dir.days.map((d) => d.events[0])).toEqual([yesterday, old]);
    expect(dir.days[0].title).toBe('Yesterday');
  });

  it('adds the year to dates outside the current year', () => {
    const dir = build([ev({ event_start_at: '2027-01-04T18:00:00Z' })]);
    expect(dir.days[0].title).toBe('Jan 4, 2027');
  });

  it('features the most-attended event in the next two weeks on the plain first page only', () => {
    const small = ev({ rsvp_count: 3 });
    const big = ev({ rsvp_count: 12, event_start_at: iso(NOW + 5 * D) });
    const far = ev({ rsvp_count: 40, event_start_at: iso(NOW + 30 * D) });
    const dir = build([small, big, far]);
    expect(dir.featured).toBe(big);
    expect(dir.days.flatMap((d) => d.events)).not.toContain(big);
    expect(dir.shown).toBe(3);
    expect(build([small, big], { q: 'event' }).featured).toBeNull();
    expect(build([small, big], { page: 2 }).featured).toBeNull();
    expect(build([small, big], { sort: 'going' }).featured).toBeNull();
    expect(build([ev()]).featured).toBeNull();
  });

  it('searches title, description, location, host and place', () => {
    const items = [
      ev({ title: 'Jazz night' }),
      ev({ description: 'Bring JAZZ records' }),
      ev({ location_name: 'Jazz Café' }),
      ev({ host_name: 'Jazzy' }),
      ev({ place: { id: 'p', slug: 'p', name: 'The Jazz Room', category: 'bar' } as PublicEventListItem['place'] }),
      ev({ title: 'Book club' }),
    ];
    const dir = build(items, { q: 'jazz' });
    expect(dir.total).toBe(5);
  });

  it('sorts by going or host as one flat group', () => {
    const a = ev({ rsvp_count: 1, host_name: 'Zoe' });
    const b = ev({ rsvp_count: 9, host_name: 'Ana' });
    const c = ev({ rsvp_count: 4, host_name: null });
    expect(build([a, b, c], { sort: 'going' }).days).toEqual([{ key: 'all', title: '', subtitle: null, events: [b, c, a] }]);
    expect(build([a, b, c], { sort: 'host' }).days[0].events).toEqual([b, a, c]);
  });

  it('pages 30 at a time and reports more', () => {
    const items = Array.from({ length: 70 }, (_, i) => ev({ event_start_at: iso(NOW + i * H) }));
    const p1 = build(items);
    expect(p1.shown).toBe(DIRECTORY_PAGE_SIZE);
    expect(p1.hasMore).toBe(true);
    const p3 = build(items, { page: 3 });
    expect(p3.shown).toBe(70);
    expect(p3.hasMore).toBe(false);
    expect(p3.total).toBe(70);
  });
});
