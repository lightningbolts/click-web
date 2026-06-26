/**
 * @jest-environment node
 */

import { NextRequest } from 'next/server';
import { POST as proximityPost } from '@/app/api/connections/proximity/route';
import type { PendingHandshakeRow } from '@/types/supabase-json';
import { PENDING_HANDSHAKE_TTL_MS } from '@/types/supabase-json';

const mockGetSupabaseFromRouteRequest = jest.fn();
const mockCreateAdminClient = jest.fn();

jest.mock('@/lib/server/supabaseRouteAuth', () => ({
  getSupabaseFromRouteRequest: (...args: unknown[]) => mockGetSupabaseFromRouteRequest(...args),
}));

jest.mock('@/lib/server/connectionWriteAuth', () => ({
  createAdminClient: () => mockCreateAdminClient(),
}));

type PendingInsert = Omit<PendingHandshakeRow, 'id' | 'created_at' | 'matched_at'> & {
  id?: string;
  created_at?: string;
  matched_at?: string | null;
};

function createInMemoryAdmin() {
  const pending: PendingHandshakeRow[] = [];
  let connectionSeq = 0;
  const connections: { id: string; user_ids: string[]; created_utc: string }[] = [];
  const chats: { connection_id: string }[] = [];
  const encounters: Record<string, unknown>[] = [];
  const users = new Map<string, Record<string, unknown>>([
    [
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        name: 'User A',
        email: 'a@click.test',
        image: null,
        created_at: '2026-01-01T00:00:00.000Z',
      },
    ],
    [
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      {
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        name: 'User B',
        email: 'b@click.test',
        image: null,
        created_at: '2026-01-02T00:00:00.000Z',
      },
    ],
  ]);

  const from = jest.fn((table: string) => {
    if (table === 'pending_handshakes') {
      return {
        delete: jest.fn().mockImplementation((...args: unknown[]) => {
          const filter = args[0];
          if (typeof filter === 'function') {
            // chained .lt / .eq — simplified: handle via builder
          }
          return {
            lt: (col: string, val: string) => {
              if (col === 'expires_at') {
                pending.splice(
                  0,
                  pending.length,
                  ...pending.filter((r) => r.expires_at >= val),
                );
              }
              return Promise.resolve({ error: null });
            },
            eq: (col: string, val: string) => ({
              is: (col2: string, val2: null) => {
                if (col === 'user_id' && col2 === 'matched_at' && val2 === null) {
                  const idx = pending.findIndex((r) => r.user_id === val && r.matched_at == null);
                  if (idx >= 0) pending.splice(idx, 1);
                }
                return Promise.resolve({ error: null });
              },
            }),
          };
        }),
        insert: jest.fn((row: PendingInsert) => ({
          select: () => ({
            single: async () => {
              const created: PendingHandshakeRow = {
                id: row.id ?? `pending-${pending.length + 1}`,
                user_id: row.user_id,
                my_token: row.my_token,
                heard_tokens: row.heard_tokens,
                lat: row.lat ?? null,
                lon: row.lon ?? null,
                lux_level: row.lux_level ?? null,
                motion_variance: row.motion_variance ?? null,
                compass_azimuth: row.compass_azimuth ?? null,
                battery_level: row.battery_level ?? null,
                sensor_payload: row.sensor_payload ?? {},
                created_at: row.created_at ?? new Date().toISOString(),
                expires_at: row.expires_at,
                matched_at: row.matched_at ?? null,
              };
              pending.push(created);
              return { data: created, error: null };
            },
          }),
        })),
        select: jest.fn(() => ({
          gt: (_col: string, val: string) => ({
            is: (_col2: string, val2: null) =>
              Promise.resolve({
                data: pending.filter((r) => r.expires_at > val && r.matched_at === val2),
                error: null,
              }),
          }),
        })),
        update: jest.fn((patch: { matched_at: string }) => ({
          in: (col: string, ids: string[]) => ({
            is: (_col2: string, val2: null) => {
              for (const row of pending) {
                if (col === 'user_id' && ids.includes(row.user_id) && row.matched_at === val2) {
                  row.matched_at = patch.matched_at;
                }
              }
              return Promise.resolve({ error: null });
            },
          }),
        })),
      };
    }

    if (table === 'connections') {
      type ConnectionRow = { id: string; user_ids: string[]; created_utc: string };
      const connectionLookup: {
        contains: jest.Mock;
        gte: jest.Mock;
        then: (resolve: (v: { data: ConnectionRow[]; error: null }) => void) => void;
      } = {
        contains: jest.fn(),
        gte: jest.fn().mockResolvedValue({ data: [], error: null }),
        then: (resolve) => resolve({ data: connections, error: null }),
      };
      connectionLookup.contains.mockReturnValue(connectionLookup);
      return {
        select: jest.fn(() => connectionLookup),
        insert: jest.fn((row: { user_ids: string[]; created_utc: string }) => ({
          select: () => ({
            single: async () => {
              connectionSeq += 1;
              const conn = {
                id: `conn-${connectionSeq}`,
                user_ids: row.user_ids,
                created_utc: row.created_utc,
              };
              connections.push(conn);
              return { data: { id: conn.id }, error: null };
            },
          }),
        })),
      };
    }

    if (table === 'chats') {
      return {
        insert: jest.fn((row: { connection_id: string }) => {
          chats.push({ connection_id: row.connection_id });
          return Promise.resolve({ error: null });
        }),
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            maybeSingle: async () => ({ data: null, error: null }),
          })),
        })),
        update: jest.fn(() => ({
          eq: () => Promise.resolve({ error: null }),
        })),
      };
    }

    if (table === 'connection_encounters') {
      type EncounterSelectChain = {
        eq: jest.Mock;
        order: jest.Mock;
      };
      const encounterSelectChain: EncounterSelectChain = {
        eq: jest.fn(),
        order: jest.fn(() => ({
          limit: jest.fn(() => ({
            maybeSingle: async () => ({ data: null, error: null }),
          })),
        })),
      };
      encounterSelectChain.eq.mockReturnValue(encounterSelectChain);
      return {
        insert: jest.fn((row: Record<string, unknown>) => {
          encounters.push(row);
          return Promise.resolve({ error: null });
        }),
        select: jest.fn(() => encounterSelectChain),
      };
    }

    if (table === 'users') {
      return {
        select: jest.fn(() => ({
          in: (_col: string, ids: string[]) =>
            Promise.resolve({
              data: ids.map((id) => users.get(id)).filter(Boolean),
              error: null,
            }),
        })),
      };
    }

    if (table === 'collaboration_sessions') {
      return {
        insert: jest.fn(() => Promise.resolve({ error: null })),
      };
    }

    throw new Error(`unexpected table ${table}`);
  });

  return {
    from,
    _pending: pending,
    _connections: connections,
  };
}

describe('POST /api/connections/proximity contract', () => {
  const userA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const userB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const sharedLat = 47.655;
  const sharedLon = -122.303;

  let adminStore: ReturnType<typeof createInMemoryAdmin>;

  beforeEach(() => {
    adminStore = createInMemoryAdmin();
    mockCreateAdminClient.mockReturnValue(adminStore);
    mockGetSupabaseFromRouteRequest.mockReset();
  });

  function makeRequest(userId: string, body: Record<string, unknown>) {
    mockGetSupabaseFromRouteRequest.mockResolvedValueOnce({
      supabase: {},
      user: { id: userId },
      authError: null,
    });
    return new NextRequest('http://localhost/api/connections/proximity', {
      method: 'POST',
      headers: {
        authorization: 'Bearer fake.jwt.token',
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  }

  it('resolves two payloads submitted 2 hours apart into a single connection', async () => {
    const twoHoursMs = 2 * 60 * 60 * 1000;
    const t0 = Date.parse('2026-06-26T10:00:00.000Z');
    const dateSpy = jest.spyOn(Date, 'now').mockReturnValue(t0);

    const resA = await proximityPost(
      makeRequest(userA, {
        my_token: '1234',
        heard_tokens: ['5678'],
        gps_lat: sharedLat,
        gps_lon: sharedLon,
      }),
    );
    expect(resA.status).toBe(202);
    const pendingA = (await resA.json()) as {
      status: string;
      pending_handshake_id: string;
      expires_at: string;
    };
    expect(pendingA.status).toBe('pending_match');
    expect(pendingA.pending_handshake_id).toBeTruthy();
    expect(Date.parse(pendingA.expires_at) - t0).toBe(PENDING_HANDSHAKE_TTL_MS);
    expect(adminStore._pending).toHaveLength(1);
    expect(adminStore._connections).toHaveLength(0);

    // User A tapped first; peer row ages 2h before User B uploads offline replay.
    adminStore._pending[0]!.created_at = new Date(t0 - twoHoursMs).toISOString();

    dateSpy.mockReturnValue(t0 + twoHoursMs);

    const resB = await proximityPost(
      makeRequest(userB, {
        my_token: '5678',
        heard_tokens: ['1234'],
        gps_lat: sharedLat + 0.00001,
        gps_lon: sharedLon + 0.00001,
      }),
    );
    expect(resB.status).toBe(200);

    const matched = (await resB.json()) as {
      success: boolean;
      matches: { id: string; connection_id: string | null }[];
      connection_id?: string;
      is_new_connection?: boolean;
    };
    expect(matched.success).toBe(true);
    expect(matched.connection_id).toBe('conn-1');
    expect(matched.is_new_connection).toBe(true);
    expect(matched.matches).toHaveLength(1);
    expect(matched.matches[0]?.id).toBe(userA);
    expect(matched.matches[0]?.connection_id).toBe('conn-1');
    expect(adminStore._connections).toHaveLength(1);
    expect(adminStore._connections[0]?.user_ids.sort()).toEqual([userA, userB].sort());

    dateSpy.mockRestore();
  });
});
