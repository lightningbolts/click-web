/**
 * @jest-environment node
 */

import { NextRequest } from 'next/server';
import { GET as proximityGet, POST as proximityPost } from '@/app/api/connections/proximity/route';
import { POST as proximityConfirm } from '@/app/api/connections/proximity/confirm/route';
import { POST as proximitySelection } from '@/app/api/connections/proximity/selection/route';
import { PENDING_HANDSHAKE_TTL_MS } from '@/types/supabase-json';
import { createInMemoryAdmin } from '@/__tests__/helpers/proximityAdmin';

const mockGetSupabaseFromRouteRequest = jest.fn();
const mockCreateAdminClient = jest.fn();

jest.mock('@/lib/server/supabaseRouteAuth', () => ({
  getSupabaseFromRouteRequest: (...args: unknown[]) => mockGetSupabaseFromRouteRequest(...args),
}));

jest.mock('@/lib/server/connectionWriteAuth', () => ({
  createAdminClient: () => mockCreateAdminClient(),
}));

describe('POST /api/connections/proximity contract', () => {
  const userA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const userB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const userC = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const extraGroupUsers = [
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000003',
    '00000000-0000-4000-8000-000000000004',
    '00000000-0000-4000-8000-000000000005',
    '00000000-0000-4000-8000-000000000006',
    '00000000-0000-4000-8000-000000000007',
    '00000000-0000-4000-8000-000000000008',
    '00000000-0000-4000-8000-000000000009',
    '00000000-0000-4000-8000-000000000010',
  ];
  const sharedLat = 47.655;
  const sharedLon = -122.303;

  let adminStore: ReturnType<typeof createInMemoryAdmin>;

  beforeEach(() => {
    adminStore = createInMemoryAdmin();
    mockCreateAdminClient.mockReturnValue(adminStore);
    mockGetSupabaseFromRouteRequest.mockReset();
    jest.spyOn(global, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('open-meteo.com')) {
        return {
          ok: true,
          json: async () => ({
            current: {
              temperature_2m: 17,
              weather_code: 3,
              wind_speed_10m: 7,
              wind_direction_10m: 225,
              pressure_msl: 1018,
            },
          }),
        } as Response;
      }
      return {
        ok: true,
        json: async () => ({
          address: { city: 'Seattle', state: 'Washington', road: 'Test Way', house_number: '1' },
          display_name: '1 Test Way, Seattle, Washington',
        }),
      } as Response;
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
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

  async function expectSimultaneousGroupAwaitingSelection(size: 5 | 10) {
    const userIds = extraGroupUsers.slice(0, size);
    adminStore = createInMemoryAdmin(userIds);
    mockCreateAdminClient.mockReturnValue(adminStore);

    const t0 = Date.now();
    const dateSpy = jest.spyOn(Date, 'now').mockReturnValue(t0);
    try {
      const responses = await Promise.all(
        userIds.map((userId, i) =>
          proximityPost(
            makeRequest(userId, {
              my_token: `${2000 + i}`,
              heard_tokens: [],
              detected_devices: [],
              gps_lat: sharedLat + i * 0.000001,
              gps_lon: sharedLon + i * 0.000001,
            }),
          ),
        ),
      );
      const finalResponses = responses.filter((res) => res.status === 200);
      expect(finalResponses.length).toBeGreaterThanOrEqual(1);

      const matched = (await finalResponses[0]!.json()) as {
        success: boolean;
        is_group?: boolean;
        awaiting_selection?: boolean;
        matches: { id: string }[];
        connection_id?: string;
        pending_handshake_id?: string;
        group_clique_candidate?: { member_user_ids: string[] };
      };

      expect(matched.success).toBe(true);
      expect(matched.awaiting_selection).toBe(true);
      expect(matched.is_group).toBe(true);
      expect(matched.connection_id).toBeUndefined();
      expect(matched.pending_handshake_id).toBeTruthy();
      expect(matched.matches).toHaveLength(size - 1);
      expect(matched.group_clique_candidate?.member_user_ids.sort()).toEqual(userIds.sort());
      // Durable create deferred until host confirm
      expect(adminStore._connections).toHaveLength(0);
    } finally {
      dateSpy.mockRestore();
    }
  }

  it('resolves two payloads submitted 2 hours apart into a single connection', async () => {
    const twoHoursMs = 2 * 60 * 60 * 1000;
    const t0 = Date.now();
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
    expect(adminStore._encounters).toHaveLength(0);

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

  it('stores empty peer-evidence payloads as pending server matches', async () => {
    const res = await proximityPost(
      makeRequest(userA, {
        my_token: '1234',
        heard_tokens: [],
        detected_devices: [],
        gps_lat: sharedLat,
        gps_lon: sharedLon,
      }),
    );
    expect(res.status).toBe(202);
    const body = (await res.json()) as { status: string; success: boolean; pending_handshake_id: string };
    expect(body.status).toBe('pending_match');
    expect(body.success).toBe(true);
    expect(body.pending_handshake_id).toBeTruthy();
    expect(adminStore._pending).toHaveLength(1);
    expect(adminStore._connections).toHaveLength(0);
    expect(adminStore._encounters).toHaveLength(0);
  });

  it('matches two simultaneous nearby payloads even when both missed radio tokens', async () => {
    const t0 = Date.now();
    const dateSpy = jest.spyOn(Date, 'now').mockReturnValue(t0);
    const resA = await proximityPost(
      makeRequest(userA, {
        my_token: '1234',
        heard_tokens: [],
        detected_devices: [],
        gps_lat: sharedLat,
        gps_lon: sharedLon,
      }),
    );
    expect(resA.status).toBe(202);

    dateSpy.mockReturnValue(t0 + 5_000);
    const resB = await proximityPost(
      makeRequest(userB, {
        my_token: '5678',
        heard_tokens: [],
        detected_devices: [],
        gps_lat: sharedLat + 0.00001,
        gps_lon: sharedLon + 0.00001,
      }),
    );
    expect(resB.status).toBe(200);
    const matched = (await resB.json()) as {
      success: boolean;
      matches: { id: string; connection_id: string | null }[];
      connection_id?: string;
    };

    expect(matched.success).toBe(true);
    expect(matched.connection_id).toBe('conn-1');
    expect(matched.matches).toHaveLength(1);
    expect(matched.matches[0]?.id).toBe(userA);
    expect(adminStore._connections[0]?.user_ids.sort()).toEqual([userA, userB].sort());
    dateSpy.mockRestore();
  });

  it('matches a three-user group via graph clustering and defers create until host selection', async () => {
    const t0 = Date.now();
    const dateSpy = jest.spyOn(Date, 'now').mockReturnValue(t0);

    await proximityPost(
      makeRequest(userA, {
        my_token: '1111',
        heard_tokens: ['2222'],
        gps_lat: sharedLat,
        gps_lon: sharedLon,
      }),
    );
    await proximityPost(
      makeRequest(userB, {
        my_token: '2222',
        heard_tokens: ['3333'],
        gps_lat: sharedLat,
        gps_lon: sharedLon,
      }),
    );

    const resC = await proximityPost(
      makeRequest(userC, {
        my_token: '3333',
        heard_tokens: ['2222', '1111'],
        gps_lat: sharedLat,
        gps_lon: sharedLon,
      }),
    );
    expect(resC.status).toBe(200);
    const matched = (await resC.json()) as {
      success: boolean;
      is_group?: boolean;
      awaiting_selection?: boolean;
      matches: { id: string }[];
      connection_id?: string;
      pending_handshake_id?: string;
      group_clique_candidate?: { member_user_ids: string[] };
    };
    expect(matched.success).toBe(true);
    expect(matched.awaiting_selection).toBe(true);
    expect(matched.is_group).toBe(true);
    expect(matched.matches).toHaveLength(2);
    expect(matched.connection_id).toBeUndefined();
    expect(matched.pending_handshake_id).toBeTruthy();
    expect(matched.group_clique_candidate?.member_user_ids.sort()).toEqual(
      [userA, userB, userC].sort(),
    );
    expect(adminStore._connections).toHaveLength(0);

    dateSpy.mockRestore();
  });

  describe('late group joiner (peers already paired before the third tap posts)', () => {
    async function pairAThenB() {
      const resA = await proximityPost(makeRequest(userA, { my_token: '1111', heard_tokens: ['2222', '3333'] }));
      const resB = await proximityPost(makeRequest(userB, { my_token: '2222', heard_tokens: ['1111', '3333'] }));
      expect(resB.status).toBe(200);
      expect(adminStore._connections.map((c) => c.user_ids.sort())).toEqual([[userA, userB].sort()]);
      const tapA = ((await resA.json()) as { pending_handshake_id: string }).pending_handshake_id;
      const tapB = ((await resB.json()) as { pending_handshake_id?: string }).pending_handshake_id;
      expect(tapB).toBeTruthy();
      return { tapA, tapB: tapB! };
    }

    function authed(userId: string) {
      mockGetSupabaseFromRouteRequest.mockResolvedValueOnce({ supabase: {}, user: { id: userId }, authError: null });
    }

    async function recover(userId: string, pendingId: string) {
      authed(userId);
      const res = await proximityGet(
        new NextRequest(`http://localhost/api/connections/proximity?pending_handshake_id=${pendingId}`),
      );
      expect(res.status).toBe(200);
      return (await res.json()) as { is_group?: boolean; connection_id?: string; matches: { id: string }[] };
    }
    const postC = () => proximityPost(makeRequest(userC, { my_token: '3333', heard_tokens: ['1111', '2222'] }));

    it('joins the already-matched pair and offers host selection', async () => {
      await pairAThenB();
      const resC = await postC();
      expect(resC.status).toBe(200);
      const body = (await resC.json()) as {
        awaiting_selection?: boolean;
        matches: { id: string }[];
        group_clique_candidate?: { member_user_ids: string[] };
      };
      expect(body.awaiting_selection).toBe(true);
      expect(body.matches.map((m) => m.id).sort()).toEqual([userA, userB].sort());
      expect(body.group_clique_candidate?.member_user_ids.sort()).toEqual([userA, userB, userC].sort());
    });

    it('reports the group to phones that already showed the 1:1 result', async () => {
      const { tapA, tapB } = await pairAThenB();
      expect((await recover(userA, tapA)).is_group).toBe(false);

      const { pending_handshake_id: tapC } = (await (await postC()).json()) as { pending_handshake_id: string };
      authed(userC);
      const confirmRes = await proximityConfirm(
        new NextRequest('http://localhost/api/connections/proximity/confirm', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ pending_handshake_id: tapC, selected_member_ids: [userA, userB] }),
        }),
      );
      expect(confirmRes.status).toBe(200);
      const group = (await confirmRes.json()) as { connection_id: string; is_group: boolean; pending_handshake_id: string };
      expect(group.is_group).toBe(true);
      expect(group.pending_handshake_id).toBe(tapC);

      for (const [userId, tap, peers] of [
        [userA, tapA, [userB, userC]],
        [userB, tapB, [userA, userC]],
        [userC, tapC, [userA, userB]],
      ] as const) {
        const seen = await recover(userId, tap);
        expect(seen.is_group).toBe(true);
        expect(seen.connection_id).toBe(group.connection_id);
        expect(seen.matches.map((m) => m.id).sort()).toEqual([...peers].sort());
      }
    });

    it('does not pull in peers matched before the late-join window', async () => {
      await pairAThenB();
      const dateSpy = jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 16_000);
      try {
        expect((await postC()).status).toBe(202);
      } finally {
        dateSpy.mockRestore();
      }
    });
  });

  it('keeps GPS/time fallback peers in a partial-token three-phone match', async () => {
    const t0 = Date.now();
    const dateSpy = jest.spyOn(Date, 'now').mockReturnValue(t0);
    const expiresAt = new Date(t0 + PENDING_HANDSHAKE_TTL_MS).toISOString();
    adminStore._pending.push(
      {
        id: 'pending-a',
        user_id: userA,
        my_token: '1111',
        heard_tokens: [],
        lat: sharedLat,
        lon: sharedLon,
        lux_level: null,
        motion_variance: null,
        compass_azimuth: null,
        battery_level: null,
        sensor_payload: {},
        created_at: new Date(t0 - 5_000).toISOString(),
        expires_at: expiresAt,
        matched_at: null,
      },
      {
        id: 'pending-b',
        user_id: userB,
        my_token: '2222',
        heard_tokens: ['3333'],
        lat: sharedLat + 0.00001,
        lon: sharedLon + 0.00001,
        lux_level: null,
        motion_variance: null,
        compass_azimuth: null,
        battery_level: null,
        sensor_payload: {},
        created_at: new Date(t0 - 4_000).toISOString(),
        expires_at: expiresAt,
        matched_at: null,
      },
    );

    const resC = await proximityPost(
      makeRequest(userC, {
        my_token: '3333',
        heard_tokens: ['2222'],
        gps_lat: sharedLat + 0.00002,
        gps_lon: sharedLon + 0.00002,
      }),
    );

    expect(resC.status).toBe(200);
    const matched = (await resC.json()) as {
      success: boolean;
      is_group?: boolean;
      awaiting_selection?: boolean;
      matches: { id: string }[];
      group_clique_candidate?: { member_user_ids: string[] };
    };
    expect(matched.success).toBe(true);
    expect(matched.awaiting_selection).toBe(true);
    expect(matched.is_group).toBe(true);
    expect(matched.matches.map((m) => m.id).sort()).toEqual([userA, userB].sort());
    expect(matched.group_clique_candidate?.member_user_ids.sort()).toEqual([userA, userB, userC].sort());
    expect(adminStore._connections).toHaveLength(0);

    dateSpy.mockRestore();
  });

  it('copies non-binding user telemetry into that user encounter row', async () => {
    const t0 = Date.now();
    const dateSpy = jest.spyOn(Date, 'now').mockReturnValue(t0);

    await proximityPost(
      makeRequest(userA, {
        my_token: '1234',
        heard_tokens: ['5678'],
        exact_noise_level_db: 42.5,
        noise_level: 'QUIET',
        exact_barometric_elevation_m: 12.25,
        height_category: 'ELEVATED',
        lux_level: 150,
        motion_variance: 0.12,
        compass_azimuth: 180,
        battery_level: 88,
      }),
    );

    const resB = await proximityPost(
      makeRequest(userB, {
        my_token: '5678',
        heard_tokens: ['1234'],
        exact_noise_level_db: 61.5,
        noise_level: 'MODERATE',
        exact_barometric_elevation_m: 7.5,
        height_category: 'GROUND_LEVEL',
        lux_level: 600,
        motion_variance: 0.42,
        compass_azimuth: 12,
        battery_level: 55,
      }),
    );

    expect(resB.status).toBe(200);
    expect(adminStore._encounters).toHaveLength(2);
    const userARow = adminStore._encounters.find((row) => row.reporting_user_id === userA);
    const userBRow = adminStore._encounters.find((row) => row.reporting_user_id === userB);
    expect(userARow).toMatchObject({
      noise_level: 'QUIET',
      exact_noise_level_db: 42.5,
      exact_barometric_elevation_m: 12.25,
      elevation_category: 'ELEVATED',
      lux_level: 150,
      motion_variance: 0.12,
      compass_azimuth: 180,
      battery_level: 88,
    });
    expect(userBRow).toMatchObject({
      noise_level: 'MODERATE',
      exact_noise_level_db: 61.5,
      exact_barometric_elevation_m: 7.5,
      elevation_category: 'GROUND_LEVEL',
      lux_level: 600,
      motion_variance: 0.42,
      compass_azimuth: 12,
      battery_level: 55,
    });
    // Legacy payloads (no observation metadata) are accepted and add no quality columns.
    expect(userARow).not.toHaveProperty('gps_horizontal_accuracy_m');

    dateSpy.mockRestore();
  });

  it('persists each phone own location and altimeter quality without merging peers', async () => {
    const t0 = Date.now();
    const dateSpy = jest.spyOn(Date, 'now').mockReturnValue(t0);
    const observedA = new Date(t0 - 400).toISOString();
    const observedB = new Date(t0 - 900).toISOString();

    await proximityPost(
      makeRequest(userA, {
        my_token: '1234',
        heard_tokens: ['5678'],
        latitude: 47.6101,
        longitude: -122.3421,
        gps_horizontal_accuracy_m: 4.8,
        gps_vertical_accuracy_m: 8.2,
        gps_altitude_m: 52.3,
        gps_ellipsoidal_altitude_m: 71.1,
        gps_observed_at: observedA,
        gps_floor: 3,
        gps_full_accuracy: true,
        exact_barometric_elevation_m: 50.9,
        barometric_accuracy_m: 1.6,
        barometric_precision_m: 0.3,
        barometric_relative_altitude_m: 0.2,
        barometric_pressure_kpa: 100.82,
        sensor_observation: { schema_version: 2, motion: { samples: [{ t_ms: -40, gravity: [0, -1, 0] }] } },
      }),
    );
    expect(adminStore._pending[0]).toMatchObject({
      horizontal_accuracy_m: 4.8,
      location_observed_at: observedA,
      sensor_payload: expect.objectContaining({ gps_floor: 3, barometric_accuracy_m: 1.6 }),
    });

    const resB = await proximityPost(
      makeRequest(userB, {
        my_token: '5678',
        heard_tokens: ['1234'],
        latitude: 47.6102,
        longitude: -122.3422,
        gps_horizontal_accuracy_m: 18.5,
        // Invalid vertical accuracy: Core Location altitude must be dropped.
        gps_vertical_accuracy_m: -1,
        gps_altitude_m: 999,
        gps_observed_at: observedB,
        gps_full_accuracy: false,
      }),
    );

    expect(resB.status).toBe(200);
    const userARow = adminStore._encounters.find((row) => row.reporting_user_id === userA);
    const userBRow = adminStore._encounters.find((row) => row.reporting_user_id === userB);
    expect(userARow).toMatchObject({
      gps_lat: 47.6101,
      gps_lon: -122.3421,
      gps_horizontal_accuracy_m: 4.8,
      gps_vertical_accuracy_m: 8.2,
      gps_altitude_m: 52.3,
      gps_ellipsoidal_altitude_m: 71.1,
      gps_observed_at: observedA,
      gps_floor: 3,
      gps_full_accuracy: true,
      exact_barometric_elevation_m: 50.9,
      barometric_accuracy_m: 1.6,
      barometric_precision_m: 0.3,
      barometric_relative_altitude_m: 0.2,
      barometric_pressure_kpa: 100.82,
      sensor_observation: { schema_version: 2, motion: { samples: [{ t_ms: -40, gravity: [0, -1, 0] }] } },
    });
    expect(userBRow).toMatchObject({
      gps_lat: 47.6102,
      gps_lon: -122.3422,
      gps_horizontal_accuracy_m: 18.5,
      gps_observed_at: observedB,
      gps_full_accuracy: false,
    });
    // B never inherits A's better accuracy, altitude, floor or barometer.
    for (const key of [
      'gps_vertical_accuracy_m',
      'gps_altitude_m',
      'gps_floor',
      'exact_barometric_elevation_m',
      'barometric_accuracy_m',
      'barometric_pressure_kpa',
      'sensor_observation',
    ]) {
      expect(userBRow).not.toHaveProperty(key);
    }

    dateSpy.mockRestore();
  });

  it('host selection never fills a member row with the host location or altitude', async () => {
    const t0 = Date.now();
    const dateSpy = jest.spyOn(Date, 'now').mockReturnValue(t0);
    await proximityPost(makeRequest(userA, { my_token: '1111', heard_tokens: ['2222', '3333'] }));
    await proximityPost(
      makeRequest(userB, {
        my_token: '2222',
        heard_tokens: ['1111', '3333'],
        gps_lat: sharedLat,
        gps_lon: sharedLon,
        gps_horizontal_accuracy_m: 12,
      }),
    );
    const resC = await proximityPost(
      makeRequest(userC, {
        my_token: '3333',
        heard_tokens: ['1111', '2222'],
        gps_lat: sharedLat + 0.00002,
        gps_lon: sharedLon + 0.00002,
        gps_horizontal_accuracy_m: 3.5,
        exact_barometric_elevation_m: 50.9,
        barometric_accuracy_m: 1.2,
      }),
    );
    const { pending_handshake_id: tapC, awaiting_selection } = (await resC.json()) as Record<string, unknown>;
    expect(awaiting_selection).toBe(true);

    mockGetSupabaseFromRouteRequest.mockResolvedValueOnce({ supabase: {}, user: { id: userC }, authError: null });
    const confirmRes = await proximityConfirm(
      new NextRequest('http://localhost/api/connections/proximity/confirm', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pending_handshake_id: tapC, selected_member_ids: [userA, userB] }),
      }),
    );
    expect(confirmRes.status).toBe(200);
    const { connection_id: groupId } = (await confirmRes.json()) as { connection_id: string };
    const groupRows = adminStore._encounters.filter((row) => row.connection_id === groupId);
    const rowFor = (id: string) => groupRows.find((row) => row.reporting_user_id === id);

    expect(rowFor(userC)).toMatchObject({
      gps_horizontal_accuracy_m: 3.5,
      exact_barometric_elevation_m: 50.9,
      barometric_accuracy_m: 1.2,
    });
    expect(rowFor(userB)).toMatchObject({ gps_lat: sharedLat, gps_horizontal_accuracy_m: 12, exact_barometric_elevation_m: null });
    expect(rowFor(userB)).not.toHaveProperty('barometric_accuracy_m');
    expect(rowFor(userA)).toMatchObject({ gps_lat: null, gps_lon: null, exact_barometric_elevation_m: null });
    expect(rowFor(userA)).not.toHaveProperty('gps_horizontal_accuracy_m');
    dateSpy.mockRestore();
  });

  it('honours a removal made on another phone when the group is confirmed', async () => {
    const t0 = Date.now();
    const dateSpy = jest.spyOn(Date, 'now').mockReturnValue(t0);
    const post = (userId: string, path: string, body: Record<string, unknown>) => {
      mockGetSupabaseFromRouteRequest.mockResolvedValueOnce({ supabase: {}, user: { id: userId }, authError: null });
      return new NextRequest(`http://localhost/api/connections/proximity/${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    };
    const at = { gps_lat: sharedLat, gps_lon: sharedLon };
    await proximityPost(makeRequest(userA, { my_token: '1111', heard_tokens: ['2222'], ...at }));
    const resB = await proximityPost(makeRequest(userB, { my_token: '2222', heard_tokens: ['3333'], ...at }));
    const resC = await proximityPost(makeRequest(userC, { my_token: '3333', heard_tokens: ['2222', '1111'], ...at }));
    const { pending_handshake_id: tapC, awaiting_selection } = (await resC.json()) as Record<string, unknown>;
    expect(awaiting_selection).toBe(true);
    const bTap = ((await resB.json()) as { pending_handshake_id?: string }).pending_handshake_id;
    expect(bTap).toBeTruthy();

    const selectionRes = await proximitySelection(
      post(userB, 'selection', { pending_handshake_id: bTap, excluded_member_ids: [userC] }),
    );
    expect(selectionRes.status).toBe(200);

    // C confirms everyone, but B removed C — so B is dropped and only A + C are joined.
    const confirmRes = await proximityConfirm(
      post(userC, 'confirm', { pending_handshake_id: tapC, selected_member_ids: [userA, userB] }),
    );
    expect(confirmRes.status).toBe(200);
    const confirmed = (await confirmRes.json()) as { is_group: boolean; matches: { id: string }[] };
    expect(confirmed.is_group).toBe(false);
    expect(confirmed.matches.map((m) => m.id)).toEqual([userA]);
    expect(adminStore._connections.some((c) => c.user_ids.includes(userB) && c.user_ids.includes(userC))).toBe(false);
    dateSpy.mockRestore();
  });

  it('matches five simultaneous nearby phones into awaiting_selection', async () => {
    await expectSimultaneousGroupAwaitingSelection(5);
  });

  it('matches ten simultaneous nearby phones into awaiting_selection', async () => {
    await expectSimultaneousGroupAwaitingSelection(10);
  });
});
