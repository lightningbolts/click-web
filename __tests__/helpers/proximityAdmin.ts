import type { PendingHandshakeRow } from '@/types/supabase-json';

/** In-memory admin client covering the tables the proximity routes touch. */
type PendingInsert = Omit<PendingHandshakeRow, 'id' | 'created_at' | 'matched_at'> & {
  id?: string;
  created_at?: string;
  matched_at?: string | null;
};

export function createInMemoryAdmin(extraUserIds: string[] = []) {
  const pending: PendingHandshakeRow[] = [];
  let connectionSeq = 0;
  const connections: { id: string; user_ids: string[]; created_utc: string; is_group?: boolean }[] = [];
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
    [
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      {
        id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        name: 'User C',
        email: 'c@click.test',
        image: null,
        created_at: '2026-01-03T00:00:00.000Z',
      },
    ],
  ]);
  extraUserIds.forEach((id, index) => {
    if (users.has(id)) return;
    users.set(id, {
      id,
      name: `User ${index + 1}`,
      email: `extra-${index + 1}@click.test`,
      image: null,
      created_at: new Date(Date.parse('2026-02-01T00:00:00.000Z') + index * 1_000).toISOString(),
    });
  });

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
                horizontal_accuracy_m: row.horizontal_accuracy_m ?? null,
                location_observed_at: row.location_observed_at ?? null,
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
        select: jest.fn(() => {
          type Filters = {
            id?: string;
            matchedAt?: string;
            userId?: string;
            expiresAfter?: string;
            unmatchedOnly?: boolean;
            matchedSince?: string;
            myTokensIn?: string[];
            minLat?: number;
            maxLat?: number;
            minLon?: number;
            maxLon?: number;
            limit?: number;
          };
          const state: Filters = {};
          const resolveRows = () => {
            let rows = [...pending];
            if (state.id) rows = rows.filter((r) => r.id === state.id);
            if (state.matchedAt) rows = rows.filter((r) => r.matched_at === state.matchedAt);
            if (state.userId) rows = rows.filter((r) => r.user_id === state.userId);
            if (state.expiresAfter) rows = rows.filter((r) => r.expires_at > state.expiresAfter!);
            if (state.unmatchedOnly) rows = rows.filter((r) => r.matched_at == null);
            if (state.matchedSince) {
              rows = rows.filter((r) => r.matched_at != null && r.matched_at >= state.matchedSince!);
            }
            if (state.myTokensIn?.length) {
              rows = rows.filter((r) => state.myTokensIn!.includes(r.my_token));
            }
            if (state.minLat != null) rows = rows.filter((r) => r.lat != null && r.lat >= state.minLat!);
            if (state.maxLat != null) rows = rows.filter((r) => r.lat != null && r.lat <= state.maxLat!);
            if (state.minLon != null) rows = rows.filter((r) => r.lon != null && r.lon >= state.minLon!);
            if (state.maxLon != null) rows = rows.filter((r) => r.lon != null && r.lon <= state.maxLon!);
            if (state.limit != null) rows = rows.slice(0, state.limit);
            return { data: rows, error: null };
          };
          const chain: Record<string, unknown> = {};
          const wrap = () => chain;
          chain.eq = (col: string, val: string) => {
            if (col === 'user_id') state.userId = val;
            if (col === 'id') state.id = val;
            if (col === 'matched_at') state.matchedAt = val;
            return wrap();
          };
          chain.maybeSingle = async () => ({ data: resolveRows().data[0] ?? null, error: null });
          chain.gt = (col: string, val: string) => {
            if (col === 'expires_at') state.expiresAfter = val;
            return wrap();
          };
          chain.is = (col: string, val: null) => {
            if (col === 'matched_at' && val === null) state.unmatchedOnly = true;
            return wrap();
          };
          chain.in = (col: string, vals: string[]) => {
            if (col === 'my_token') state.myTokensIn = vals;
            return wrap();
          };
          chain.gte = (col: string, val: number | string) => {
            if (col === 'matched_at') state.matchedSince = String(val);
            if (col === 'lat' && typeof val === 'number') state.minLat = val;
            if (col === 'lon' && typeof val === 'number') state.minLon = val;
            return wrap();
          };
          chain.lte = (col: string, val: number) => {
            if (col === 'lat') state.maxLat = val;
            if (col === 'lon') state.maxLon = val;
            return wrap();
          };
          chain.limit = (n: number) => {
            state.limit = n;
            return wrap();
          };
          chain.or = (_expr: string) => Promise.resolve(resolveRows());
          chain.then = (resolve: (v: { data: PendingHandshakeRow[]; error: null }) => void) =>
            Promise.resolve(resolveRows()).then(resolve);
          return chain;
        }),
        update: jest.fn((patch: Partial<PendingHandshakeRow>) => ({
          eq: (col: string, val: string) => {
            const filters: Record<string, string> = { [col]: val };
            const chain = {
              eq: (col2: string, val2: string) => {
                filters[col2] = val2;
                return chain;
              },
              is: (_col3: string, val3: null) => {
                for (const row of pending) {
                  const rec = row as unknown as Record<string, unknown>;
                  if (Object.entries(filters).every(([k, v]) => rec[k] === v) && row.matched_at === val3) {
                    Object.assign(row, patch);
                  }
                }
                return Promise.resolve({ error: null });
              },
            };
            return chain;
          },
          in: (col: string, ids: string[]) => ({
            is: (_col2: string, val2: null) => {
              for (const row of pending) {
                if (col === 'user_id' && ids.includes(row.user_id) && row.matched_at === val2) {
                  Object.assign(row, patch);
                }
              }
              return Promise.resolve({ error: null });
            },
            then: (resolve: (v: { error: null }) => void) => {
              for (const row of pending) {
                if (col === 'id' && ids.includes(row.id)) Object.assign(row, patch);
              }
              return Promise.resolve({ error: null }).then(resolve);
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
        eq: (col: string, id: string) => { maybeSingle: () => Promise<{ data: ConnectionRow | null; error: null }> };
        then: (resolve: (v: { data: ConnectionRow[]; error: null }) => void) => void;
      } = {
        contains: jest.fn(),
        gte: jest.fn().mockResolvedValue({ data: [], error: null }),
        eq: (_col, id) => ({
          maybeSingle: async () => ({ data: connections.find((c) => c.id === id) ?? null, error: null }),
        }),
        then: (resolve) => resolve({ data: connections, error: null }),
      };
      connectionLookup.contains.mockReturnValue(connectionLookup);
      return {
        select: jest.fn(() => connectionLookup),
        insert: jest.fn((row: { user_ids: string[]; created_utc: string; is_group?: boolean }) => ({
          select: () => ({
            single: async () => {
              connectionSeq += 1;
              const conn = {
                id: `conn-${connectionSeq}`,
                user_ids: row.user_ids,
                created_utc: row.created_utc,
                is_group: row.is_group,
              };
              connections.push(conn);
              return { data: { id: conn.id }, error: null };
            },
          }),
        })),
        update: jest.fn(() => ({
          eq: () => ({
            eq: () => Promise.resolve({ error: null }),
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
        update: jest.fn(() => ({
          eq: () => Promise.resolve({ error: null }),
        })),
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

    if (table === 'connection_flow_events') {
      return { insert: jest.fn(() => Promise.resolve({ error: null })) };
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
    rpc: jest.fn().mockResolvedValue({ data: [], error: null }),
    _pending: pending,
    _connections: connections,
    _encounters: encounters,
  };
}
