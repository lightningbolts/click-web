import type { HomeNudge } from '@/lib/dashboard/homeFeed';
import { eventIsUpcomingOrLive, homeGreetingFor, hourIn, selectHomeOpportunity } from '@/lib/home/selectOpportunity';
import type { HomeEvent, HomeSayHi } from '@/lib/home/types';

const NOW = Date.parse('2026-10-05T15:00:00Z');
const H = 3_600_000;
const iso = (ms: number) => new Date(ms).toISOString();

const event = (over: Partial<HomeEvent>): HomeEvent => ({
  id: 'e',
  title: 'Event',
  startAt: iso(NOW + 2 * H),
  endAt: iso(NOW + 4 * H),
  locationName: null,
  imageUrl: null,
  relation: 'going',
  ...over,
});
const sayHi = (id: string, hoursLeft: number): HomeSayHi => ({
  connectionId: id,
  person: { id: `p-${id}`, name: id, avatarUrl: null },
  deadlineMs: NOW + hoursLeft * H,
});
const nudge = (nudge_type: string, connection_id: string | null = null): HomeNudge => ({
  id: nudge_type,
  nudge_type,
  connection_id,
  beacon_id: null,
  headline: nudge_type,
  body: '',
  payload: {},
});

const base = { events: [], newClicks: [], nudges: [], people: new Map(), nowMs: NOW, timeZone: 'UTC' };

describe('selectHomeOpportunity', () => {
  it('promotes a live event you committed to above everything else', () => {
    const live = event({ id: 'live', startAt: iso(NOW - H), endAt: iso(NOW + H) });
    const result = selectHomeOpportunity({ ...base, events: [live], newClicks: [sayHi('a', 2)], nudges: [nudge('wave')] });
    expect(result).toEqual({ kind: 'event', event: live, live: true });
  });

  it('does not promote a live event that is only saved', () => {
    const saved = event({ relation: 'saved', startAt: iso(NOW - H), endAt: iso(NOW + H) });
    const result = selectHomeOpportunity({ ...base, events: [saved], newClicks: [sayHi('a', 2)] });
    expect(result?.kind).toBe('sayHi');
  });

  it('picks the new Click with the least time left, ignoring expired windows', () => {
    const result = selectHomeOpportunity({ ...base, newClicks: [sayHi('later', 30), sayHi('soon', 3), sayHi('gone', -1)] });
    expect(result).toMatchObject({ kind: 'sayHi', connectionId: 'soon' });
  });

  it('then today’s event in the viewer’s zone', () => {
    const tonight = event({ id: 'tonight', startAt: iso(NOW + 5 * H), endAt: iso(NOW + 7 * H) });
    const tomorrow = event({ id: 'tomorrow', startAt: iso(NOW + 20 * H), endAt: iso(NOW + 22 * H) });
    expect(selectHomeOpportunity({ ...base, events: [tomorrow, tonight] })).toMatchObject({ event: { id: 'tonight' }, live: false });
    // 15:00Z is already the 6th in Tokyo, where "tonight" (20:00Z) and "tomorrow" (11:00Z+1) differ.
    expect(selectHomeOpportunity({ ...base, timeZone: 'Asia/Tokyo', events: [tomorrow, tonight] })).toMatchObject({
      event: { id: 'tonight' },
    });
  });

  it('falls back to the highest-priority nudge with its person', () => {
    const person = { id: 'p1', name: 'Sam', avatarUrl: null };
    const result = selectHomeOpportunity({
      ...base,
      nudges: [nudge('memory_prompt'), nudge('wave', 'c1'), nudge('reconnect_lull')],
      people: new Map([['c1', person]]),
    });
    expect(result).toMatchObject({ kind: 'nudge', nudge: { nudge_type: 'wave' }, person });
  });

  it('returns null when there is nothing to promote', () => {
    expect(selectHomeOpportunity(base)).toBeNull();
  });
});

describe('event timing', () => {
  it('treats an event without an end as running for 3 hours', () => {
    expect(eventIsUpcomingOrLive(event({ startAt: iso(NOW - 2 * H), endAt: null }), NOW)).toBe(true);
    expect(eventIsUpcomingOrLive(event({ startAt: iso(NOW - 4 * H), endAt: null }), NOW)).toBe(false);
  });
});

describe('greeting', () => {
  it.each([
    [5, 'Good morning, Ada'],
    [12, 'Good afternoon, Ada'],
    [18, 'Good evening, Ada'],
    [2, 'Good evening, Ada'],
  ])('hour %i → %s', (hour, text) => {
    expect(homeGreetingFor('Ada', hour)).toBe(text);
  });

  it('reads the hour in the given zone', () => {
    expect(hourIn(NOW, 'UTC')).toBe(15);
    expect(hourIn(NOW, 'America/Los_Angeles')).toBe(8);
  });
});
