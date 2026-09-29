/** @jest-environment node */

jest.mock('server-only', () => ({}));

const mockBlocked = jest.fn();
jest.mock('@/lib/server/connections/viewerPeers', () => ({
  loadBlockedUserIds: (...args: unknown[]) => mockBlocked(...args),
}));

import { eventDropAccess, visibleEventDrops, type DropEvent, type EventDropRow } from '@/lib/server/eventDrops';

const REVEAL = Date.parse('2026-10-03T17:00:00Z');
const event: DropEvent = {
  id: 'evt',
  title: 'Launch',
  creatorId: 'host',
  schedule: { opensAtMs: REVEAL - 20 * 3_600_000, closesAtMs: REVEAL - 10 * 3_600_000, revealAtMs: REVEAL },
};
const config = { perUserCap: 10, revealHourLocal: 10, absenteeLimit: 2 };

function row(id: string, user: string, minute: number, show = true): EventDropRow {
  return {
    id,
    beacon_id: 'evt',
    user_id: user,
    client_drop_id: `c-${id}`,
    original_path: `event/evt/${user}/${id}-original.jpg`,
    preview_path: `event/evt/${user}/${id}-preview.jpg`,
    width: null,
    height: null,
    filter_seed: 1,
    show_to_absentees: show,
    created_at: new Date(REVEAL - 15 * 3_600_000 + minute * 60_000).toISOString(),
    reveal_at: new Date(REVEAL).toISOString(),
  };
}

const rows = [
  row('a1', 'ana', 1),
  row('me1', 'me', 2),
  row('b1', 'ben', 3, false),
  row('a2', 'ana', 4),
  row('x1', 'blocked', 5),
  row('c1', 'cal', 6),
];

const admin = {
  from: () => {
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'is']) chain[m] = () => chain;
    chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve(resolve({ data: rows, error: null }));
    return chain;
  },
};

const participant = { checkedIn: true, rsvpd: true, hosted: false };
const absentee = { checkedIn: false, rsvpd: true, hosted: false };
const stranger = { checkedIn: false, rsvpd: false, hosted: false };

describe('visibleEventDrops', () => {
  beforeEach(() => mockBlocked.mockResolvedValue(new Set(['blocked'])));

  it('maps roles to access', () => {
    expect(eventDropAccess(participant)).toBe('participant');
    expect(eventDropAccess({ ...stranger, hosted: true })).toBe('participant');
    expect(eventDropAccess(absentee)).toBe('absentee');
    expect(eventDropAccess(stranger)).toBe('none');
  });

  it("shows only the viewer's own drops before the reveal", async () => {
    const ids = (await visibleEventDrops(admin as never, event, 'me', participant, config, REVEAL - 1)).map((r) => r.id);
    expect(ids).toEqual(['me1']);
    expect(await visibleEventDrops(admin as never, event, 'me', absentee, config, REVEAL - 1)).toEqual([]);
  });

  it('shows participants everything after reveal, their own first, never blocked people', async () => {
    const ids = (await visibleEventDrops(admin as never, event, 'me', participant, config, REVEAL)).map((r) => r.id);
    expect(ids).toEqual(['me1', 'a1', 'b1', 'a2', 'c1']);
  });

  it('shows absentees a small, opted-in, round-robin set', async () => {
    const ids = (await visibleEventDrops(admin as never, event, 'me', absentee, config, REVEAL)).map((r) => r.id);
    expect(ids).toHaveLength(2);
    expect(ids).not.toContain('b1');
    expect(ids).not.toContain('x1');
    expect(new Set(ids.map((id) => id[0])).size).toBe(2); // two different posters
  });

  it('shows strangers nothing', async () => {
    expect(await visibleEventDrops(admin as never, event, 'me', stranger, config, REVEAL)).toEqual([]);
  });
});
