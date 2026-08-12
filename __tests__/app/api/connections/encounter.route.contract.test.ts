/**
 * @jest-environment node
 */

import { NextRequest } from 'next/server';
import { POST as encounterPost } from '@/app/api/connections/encounter/route';

const mockGetSupabaseFromRouteRequest = jest.fn();
const mockCreateAdminClient = jest.fn();

jest.mock('@/lib/server/supabaseRouteAuth', () => ({
  getSupabaseFromRouteRequest: (...args: unknown[]) => mockGetSupabaseFromRouteRequest(...args),
}));

jest.mock('@/lib/server/connectionWriteAuth', () => ({
  createAdminClient: () => mockCreateAdminClient(),
}));

jest.mock('@/lib/server/resolveLiveEventBeaconAt', () => ({
  resolveLiveEventBeaconForReportingUser: jest.fn().mockResolvedValue(null),
  applyLiveEventBeaconToEncounterRow: (
    insertRow: Record<string, unknown>,
    _attachment: unknown,
  ) => insertRow,
}));

describe('POST /api/connections/encounter contract', () => {
  const userA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const userB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  beforeEach(() => {
    mockGetSupabaseFromRouteRequest.mockReset();
    mockCreateAdminClient.mockReset();
    mockCreateAdminClient.mockReturnValue({ from: jest.fn(), rpc: jest.fn() });
  });

  it('inserts into connection_encounters without touching connections (mocked DB)', async () => {
    const connectionSelect = jest.fn().mockReturnValue({
      contains: jest.fn().mockResolvedValue({
        data: [{ id: 'conn-pair', user_ids: [userA, userB] }],
        error: null,
      }),
    });

    const encounterInsert = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        maybeSingle: jest.fn().mockResolvedValue({
          data: { id: 'enc-row-1' },
          error: null,
        }),
      }),
    });

    const from = jest.fn((table: string) => {
      if (table === 'connections') {
        return { select: connectionSelect };
      }
      if (table === 'connection_encounters') {
        return { insert: encounterInsert };
      }
      throw new Error(`unexpected table ${table}`);
    });

    mockGetSupabaseFromRouteRequest.mockResolvedValue({
      supabase: { from },
      user: { id: userA },
      authError: null,
    });

    const req = new NextRequest('http://localhost/api/connections/encounter', {
      method: 'POST',
      headers: {
        authorization: 'Bearer fake.jwt.token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        user_id: userA,
        peer_id: userB,
        sensor_data: { lux_level: 42, custom_probe: { x: 1 } },
      }),
    });

    const res = await encounterPost(req);
    expect(res.status).toBe(200);

    expect(from).toHaveBeenCalledWith('connections');
    expect(from).toHaveBeenCalledWith('connection_encounters');
    expect(connectionSelect).toHaveBeenCalledWith('id, user_ids');
    expect(encounterInsert).toHaveBeenCalledTimes(1);

    const insertedArg = encounterInsert.mock.calls[0][0] as Record<string, unknown>;
    expect(insertedArg.connection_id).toBe('conn-pair');
    expect(insertedArg.reporting_user_id).toBe(userA);
    expect(insertedArg.lux_level).toBe(42);
    expect(insertedArg.vibe_capture).toEqual({ custom_probe: { x: 1 } });

    const json = (await res.json()) as { success: boolean; encounter_id: string | null };
    expect(json.success).toBe(true);
    expect(json.encounter_id).toBe('enc-row-1');
  });

  it('does not surface unique-constraint style failures as 409 when insert succeeds', async () => {
    const from = jest.fn((table: string) => {
      if (table === 'connections') {
        return {
          select: jest.fn().mockReturnValue({
            contains: jest.fn().mockResolvedValue({
              data: [{ id: 'conn-stable', user_ids: [userA, userB] }],
              error: null,
            }),
          }),
        };
      }
      if (table === 'connection_encounters') {
        return {
          insert: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
              maybeSingle: jest.fn().mockResolvedValue({
                data: { id: 'second-encounter' },
                error: null,
              }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    });

    mockGetSupabaseFromRouteRequest.mockResolvedValue({
      supabase: { from },
      user: { id: userA },
      authError: null,
    });

    const req = new NextRequest('http://localhost/api/connections/encounter', {
      method: 'POST',
      headers: {
        authorization: 'Bearer fake.jwt.token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        user_id: userA,
        peer_id: userB,
        sensor_data: {},
      }),
    });

    const res = await encounterPost(req);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { success: boolean };
    expect(json.success).toBe(true);
  });

  it('keeps encounter rate-limit responses stable', async () => {
    const encounterInsert = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        maybeSingle: jest.fn().mockResolvedValue({
          data: null,
          error: { message: 'encounter_rate_limit_3h' },
        }),
      }),
    });
    const from = jest.fn((table: string) => {
      if (table === 'connections') {
        return {
          select: jest.fn().mockReturnValue({
            contains: jest.fn().mockResolvedValue({
              data: [{ id: 'conn-limited', user_ids: [userA, userB] }],
              error: null,
            }),
          }),
        };
      }
      if (table === 'connection_encounters') {
        return { insert: encounterInsert };
      }
      throw new Error(`unexpected table ${table}`);
    });

    mockGetSupabaseFromRouteRequest.mockResolvedValue({
      supabase: { from },
      user: { id: userA },
      authError: null,
    });

    const req = new NextRequest('http://localhost/api/connections/encounter', {
      method: 'POST',
      headers: {
        authorization: 'Bearer fake.jwt.token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        user_id: userA,
        peer_id: userB,
        sensor_data: {},
      }),
    });

    const res = await encounterPost(req);
    expect(res.status).toBe(429);
    const json = (await res.json()) as { success: boolean; rate_limited: boolean };
    expect(json.success).toBe(false);
    expect(json.rate_limited).toBe(true);
    expect(encounterInsert.mock.calls[0][0].reporting_user_id).toBe(userA);
  });
});
