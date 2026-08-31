/**
 * @jest-environment node
 */

import {
  emptyActivityRecap,
  loadActivityRecap,
  recapRowTimestampMs,
  recapWindowStart,
} from '@/lib/me/activityRecap';

const NOW = Date.parse('2026-08-17T12:00:00.000Z');
const USER = 'user-1';

type QueryResult = {
  data?: unknown;
  count?: number | null;
  error?: { message: string; code?: string } | null;
};

type Handler = (filters: Record<string, unknown>) => QueryResult | Promise<QueryResult>;

function mockAdmin(handlers: Record<string, Handler>) {
  return {
    from(table: string) {
      const filters: Record<string, unknown> = { table };
      const chain: {
        select: (...args: unknown[]) => typeof chain;
        contains: (...args: unknown[]) => typeof chain;
        eq: (col: string, val: unknown) => typeof chain;
        in: (col: string, val: unknown) => typeof chain;
        neq: (col: string, val: unknown) => typeof chain;
        gte: (col: string, val: unknown) => typeof chain;
        then: (
          resolve: (value: QueryResult) => unknown,
          reject?: (reason: unknown) => unknown,
        ) => Promise<unknown>;
      } = {
        select: () => chain,
        contains: () => chain,
        eq: (col, val) => {
          filters[col] = val;
          return chain;
        },
        in: (col, val) => {
          filters[col] = val;
          return chain;
        },
        neq: (col, val) => {
          filters[`neq_${col}`] = val;
          return chain;
        },
        gte: (col, val) => {
          filters[`gte_${col}`] = val;
          return chain;
        },
        then(resolve, reject) {
          try {
            const result = handlers[table]?.(filters) ?? { data: [], count: 0, error: null };
            return Promise.resolve(result).then(resolve, reject);
          } catch (e) {
            return Promise.reject(e).then(resolve, reject);
          }
        },
      };
      return chain;
    },
  };
}

describe('recapWindowStart', () => {
  it('uses 24h for day and 7d for week', () => {
    expect(NOW - recapWindowStart('day', NOW)).toBe(24 * 60 * 60 * 1000);
    expect(NOW - recapWindowStart('week', NOW)).toBe(7 * 24 * 60 * 60 * 1000);
  });
});

describe('recapRowTimestampMs', () => {
  it('parses numeric created, ISO created_at, and rejects garbage', () => {
    expect(recapRowTimestampMs({ created: NOW })).toBe(NOW);
    expect(recapRowTimestampMs({ created_at: '2026-08-17T12:00:00.000Z' })).toBe(NOW);
    expect(recapRowTimestampMs({ created: 'not-a-time' })).toBeNull();
    expect(recapRowTimestampMs({ memory_capsule: '{"x":1}' })).toBeNull();
  });
});

describe('emptyActivityRecap', () => {
  it('returns a zeroed payload for the requested window', () => {
    const recap = emptyActivityRecap('week', NOW);
    expect(recap.window).toBe('week');
    expect(recap.connections_formed).toBe(0);
    expect(recap.messages_sent).toBe(0);
    expect(recap.events_saved).toBe(0);
  });
});

describe('loadActivityRecap', () => {
  it('returns zeros when the user has no connections', async () => {
    const admin = mockAdmin({
      connection_archives: () => ({ data: [], error: null }),
      connection_hidden: () => ({ data: [], error: null }),
      connections: () => ({ data: [], error: null }),
      messages: () => ({ count: 0, error: null }),
      map_beacons: () => ({ count: 0, error: null }),
      beacon_attendees: () => ({ count: 0, error: null }),
      event_check_ins: () => ({ count: 0, error: null }),
      event_bookmarks: () => ({ count: 0, error: null }),
    });
    const recap = await loadActivityRecap(admin as never, USER, 'week', NOW);
    expect(recap).toEqual(emptyActivityRecap('week', NOW));
  });

  it('skips archived, hidden, and non-handshake rows', async () => {
    const admin = mockAdmin({
      connection_archives: () => ({ data: [{ connection_id: 'archived-1' }], error: null }),
      connection_hidden: () => ({ data: [{ connection_id: 'hidden-1' }], error: null }),
      connections: () => ({
        data: [
          { id: 'archived-1', created: NOW, source: 'handshake', status: 'active' },
          { id: 'hidden-1', created: NOW, source: 'handshake', status: 'active' },
          { id: 'removed-1', created: NOW, source: 'handshake', status: 'removed' },
          { id: 'prior-1', created: NOW, source: 'prior', status: 'active' },
          {
            id: 'kept-1',
            created: NOW - 60_000,
            source: 'handshake',
            status: 'kept',
          },
        ],
        error: null,
      }),
      chats: () => ({ data: [{ id: 'chat-1' }], error: null }),
      messages: () => ({ count: 2, error: null }),
      map_beacons: () => ({ count: 1, error: null }),
      beacon_attendees: () => ({ count: 0, error: null }),
      event_check_ins: () => ({ count: 0, error: null }),
      event_bookmarks: () => ({ count: 3, error: null }),
    });
    const recap = await loadActivityRecap(admin as never, USER, 'week', NOW);
    expect(recap.connections_formed).toBe(1);
    expect(recap.messages_sent).toBe(2);
    expect(recap.events_saved).toBe(3);
  });

  it('treats missing junction tables and JSON metadata blobs as empty, not fatal', async () => {
    const admin = mockAdmin({
      connection_archives: () => ({
        data: null,
        error: { code: 'PGRST205', message: 'Could not find the table' },
      }),
      connection_hidden: () => ({
        data: null,
        error: { message: 'relation "connection_hidden" does not exist' },
      }),
      connections: () => ({
        data: [
          '{"id":"c1","created":"not-json-object"}',
          {
            id: 'c2',
            created: NOW - 1000,
            source: 'handshake',
            status: 'active',
            memory_capsule: '{"weather":"rain"',
          },
        ],
        error: null,
      }),
      chats: () => ({ data: null, error: null }),
      messages: () => ({ count: 0, error: null }),
      map_beacons: () => ({ count: 0, error: null }),
      beacon_attendees: () => ({ count: 0, error: null }),
      event_check_ins: () => ({ count: 0, error: null }),
      event_bookmarks: () => ({ count: 0, error: null }),
    });
    const recap = await loadActivityRecap(admin as never, USER, 'week', NOW);
    expect(recap.connections_formed).toBe(1);
    expect(recap.messages_received).toBe(0);
  });

  it('returns zeros when message timestamp columns are missing', async () => {
    const admin = mockAdmin({
      connection_archives: () => ({ data: [], error: null }),
      connection_hidden: () => ({ data: [], error: null }),
      connections: () => ({ data: [], error: null }),
      messages: () => ({
        count: null,
        error: { message: "column messages.created_at does not exist" },
      }),
      map_beacons: () => ({ count: 0, error: null }),
      beacon_attendees: () => ({ count: 0, error: null }),
      event_check_ins: () => ({ count: 0, error: null }),
      event_bookmarks: () => ({ count: 0, error: null }),
    });
    const recap = await loadActivityRecap(admin as never, USER, 'week', NOW);
    expect(recap.messages_sent).toBe(0);
    expect(recap.connections_formed).toBe(0);
  });
});
