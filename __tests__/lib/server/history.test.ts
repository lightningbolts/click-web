/** @jest-environment node */

jest.mock('server-only', () => ({}));
const mockEvents = jest.fn();
jest.mock('@/lib/server/eventHistory', () => ({
  ...jest.requireActual('@/lib/server/eventHistory'),
  loadUserEvents: (...a: unknown[]) => mockEvents(...a),
  loadRecapStates: async () => new Map(),
}));

import { loadHistoryPage } from '@/lib/server/history';

const NOW = Date.parse('2026-10-05T18:00:00Z');
const tables: Record<string, unknown[]> = {
  map_beacons: [{ id: 'b1', beacon_type: 'soundtrack', metadata: { track_name: 'Song' }, created_at: '2026-10-04T10:00:00Z' }],
  reactions: [],
  beacon_confirmations: [],
  hangout_confirmations: [{ id: 'h1', connection_id: 'c1', user_ids: ['me', 'maya'], occurred_at: '2026-10-03T10:00:00Z', location_name: 'Cafe' }],
  users: [{ id: 'maya', first_name: 'Maya', last_name: null, name: null, image: null }],
};
const admin = {
  from: (t: string) => {
    const c: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'neq', 'order', 'limit', 'in', 'contains']) c[m] = () => c;
    c.then = (r: (v: unknown) => unknown) => Promise.resolve(r({ data: tables[t] ?? [], error: null }));
    return c;
  },
};

describe('loadHistoryPage', () => {
  beforeEach(() =>
    mockEvents.mockResolvedValue([
      { beaconId: 'e1', startMs: NOW - 30 * 3.6e6, endMs: NOW - 27 * 3.6e6, relation: { went: true, rsvpd: true, saved: false, hosted: false }, title: 'Launch', locationName: null, imageUrl: null },
      { beaconId: 'e-future', startMs: NOW + 3.6e6, endMs: NOW + 7.2e6, relation: { went: false, rsvpd: true, saved: false, hosted: false }, title: 'Soon', locationName: null, imageUrl: null },
    ]),
  );

  it('merges events, beacons and hangouts newest first, past events only', async () => {
    const page = await loadHistoryPage(admin as never, 'me', 'all', null, 10, NOW);
    expect(page.items.map((i) => `${i.kind}:${i.id}:${i.detail}`)).toEqual([
      'event:e1:Went',
      'beacon:b1:Dropped',
      'hangout:h1:Hangout',
    ]);
    expect(page.items[2].title).toBe('Hangout with Maya');
  });

  it('filters by kind and pages by time', async () => {
    expect((await loadHistoryPage(admin as never, 'me', 'hangouts', null, 10, NOW)).items.map((i) => i.kind)).toEqual(['hangout']);
    const first = await loadHistoryPage(admin as never, 'me', 'all', null, 1, NOW);
    const second = await loadHistoryPage(admin as never, 'me', 'all', Date.parse(first.nextCursor!), 1, NOW);
    expect(second.items[0].id).toBe('b1');
  });
});
