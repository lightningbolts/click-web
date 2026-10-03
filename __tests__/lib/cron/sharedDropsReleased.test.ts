/** @jest-environment node */

jest.mock('server-only', () => ({}));

const mockPeers = jest.fn();
const mockResolve = jest.fn();
const mockSend = jest.fn();
const mockAllows = jest.fn();
jest.mock('@/lib/server/connections/viewerPeers', () => ({ loadViewerPeers: (...a: unknown[]) => mockPeers(...a) }));
jest.mock('@/lib/server/sharedDrops', () => ({ resolveSharedDrops: (...a: unknown[]) => mockResolve(...a) }));
jest.mock('@/lib/server/featureFlags', () => ({ resolveFeature: async () => ({ enabled: true, config: {} }) }));
jest.mock('@/lib/nudges/moments', () => ({
  sendPush: (...a: unknown[]) => mockSend(...a),
  userAllowsPush: (...a: unknown[]) => mockAllows(...a),
}));

import { FakeDb } from '../../helpers/fakeSupabase';
import { dropReleasedCopy, runSharedDropsReleased } from '@/lib/cron/sharedDropsReleased';

const NOW = Date.parse('2026-10-03T18:00:00Z');
const minsAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();
const drop = (id: string, user: string, revealMinsAgo: number, extra: Record<string, unknown> = {}) => ({
  id, user_id: user, reveal_at: minsAgo(revealMinsAgo), release_notified_at: null, deleted_at: null, ...extra,
});

function world() {
  return new FakeDb({
    tables: {
      shared_drops: [
        drop('maya-1', 'maya', 1),
        drop('sam-1', 'sam', 2),
        drop('old', 'maya', 120), // developed long ago: never touched
        drop('later', 'maya', -10), // still developing
        drop('done', 'maya', 3, { release_notified_at: minsAgo(2) }),
      ],
      users: [
        { id: 'maya', name: 'Maya Lin' },
        { id: 'sam', name: 'Sam Ortiz' },
      ],
    },
  });
}

beforeEach(() => {
  mockPeers.mockImplementation(async (_admin: unknown, poster: string) =>
    new Map(poster === 'maya' ? [['me', {}], ['sam', {}]] : [['me', {}], ['maya', {}]]),
  );
  // Sam can't see Maya's drop (core-only); everyone sees Sam's.
  mockResolve.mockImplementation(async (_admin: unknown, viewer: string, ids: string[]) =>
    new Map(ids.filter((id) => !(viewer === 'sam' && id === 'maya-1')).map((id) => [id, {}])),
  );
  mockSend.mockReset().mockResolvedValue(true);
  mockAllows.mockReset().mockResolvedValue(true);
});

describe('runSharedDropsReleased', () => {
  it('claims fresh releases once and pushes each viewer one batched notification', async () => {
    const db = world();
    const result = await runSharedDropsReleased(db.client as never, 'https://push', 'bearer', NOW);
    expect(result).toEqual({ released: 2, pushed: 2 });
    const pushes = Object.fromEntries(mockSend.mock.calls.map((c) => [c[2], { copy: c[3], data: c[4] }]));
    expect(pushes.me.copy.body).toBe('New drops from Maya and Sam just developed.');
    expect(pushes.me.data).toMatchObject({ type: 'shared_drop_released', drop_count: 2 });
    expect(pushes.maya.copy.body).toBe("Sam's drop just developed. Take a look.");
    expect(pushes.sam).toBeUndefined(); // only Sam's own drop would be visible to Sam → nothing
    expect(Object.keys(pushes).sort()).toEqual(['maya', 'me']);
    const rows = Object.fromEntries(db.rows('shared_drops').map((r) => [r.id, r.release_notified_at]));
    expect(rows['maya-1']).toBe(new Date(NOW).toISOString());
    expect(rows.old).toBeNull();
    expect(rows.later).toBeNull();
    // A second run finds nothing left to send.
    mockSend.mockClear();
    expect(await runSharedDropsReleased(db.client as never, 'https://push', 'bearer', NOW)).toEqual({ released: 0, pushed: 0 });
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('respects the Click Drops notification setting', async () => {
    mockAllows.mockImplementation(async (_a: unknown, user: string, pref: string) => !(user === 'me' && pref === 'drop_release_push_enabled'));
    await runSharedDropsReleased(world().client as never, 'https://push', 'bearer', NOW);
    expect(mockSend.mock.calls.map((c) => c[2])).toEqual(['maya']);
  });

  it('writes nothing to push when push is not configured but still claims', async () => {
    const db = world();
    expect(await runSharedDropsReleased(db.client as never, null, null, NOW)).toEqual({ released: 2, pushed: 0 });
    expect(mockSend).not.toHaveBeenCalled();
  });
});

describe('dropReleasedCopy', () => {
  it('names one, two, or the first and a count', () => {
    expect(dropReleasedCopy(['Maya']).body).toBe("Maya's drop just developed. Take a look.");
    expect(dropReleasedCopy(['Maya', 'Sam']).body).toBe('New drops from Maya and Sam just developed.');
    expect(dropReleasedCopy(['Maya', 'Sam', 'Ana']).body).toBe('New drops from Maya and 2 others just developed.');
  });
});
