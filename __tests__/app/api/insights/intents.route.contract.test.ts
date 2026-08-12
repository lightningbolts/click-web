/**
 * @jest-environment node
 */

import { NextRequest } from 'next/server';
import { GET as intentsGet } from '@/app/api/insights/intents/route';
import {
  expectFilter,
  expectRpcCalledWith,
  makeSupabaseMock,
  type QueryResult,
  type SupabaseMockOptions,
} from '../../../helpers/supabaseRouteMocks';

const mockGetSupabaseFromRouteRequest = jest.fn();
const mockUserMayAccessBusinessInsights = jest.fn();
const mockResolveInsightsVenueId = jest.fn();

jest.mock('@/lib/server/supabaseRouteAuth', () => ({
  getSupabaseFromRouteRequest: (...args: unknown[]) => mockGetSupabaseFromRouteRequest(...args),
}));

jest.mock('@/lib/server/businessInsightsEligibility', () => ({
  userMayAccessBusinessInsights: (...args: unknown[]) => mockUserMayAccessBusinessInsights(...args),
}));

jest.mock('@/lib/server/resolveInsightsVenueId', () => ({
  resolveInsightsVenueId: (...args: unknown[]) => mockResolveInsightsVenueId(...args),
}));

const MOCK_USER_ID = 'user-mgr-999';
const MOCK_VENUE_ID = 'venue-888';

const ok = (data: unknown): QueryResult => ({ data, error: null });

const RADAR_PAYLOAD = {
  status: 'ok',
  venueCenter: { lat: 47.6062, lng: -122.3321 },
  radiusMeters: 200,
  clusters: [
    { hex_id: 'hex-abc', category: 'Drinks', count: 45, approx_lat: 47.607, approx_lng: -122.333 },
  ],
  categoryTotals: [{ category: 'Drinks', count: 45 }],
};

function setupSupabase(
  overrides: {
    venueManagers?: QueryResult;
    rpc?: SupabaseMockOptions['rpc'];
    user?: Record<string, unknown>;
  } = {},
) {
  const mock = makeSupabaseMock({
    tables: { venue_managers: overrides.venueManagers ?? ok({ id: 'vm-1' }) },
    rpc: overrides.rpc ?? ((fn) => (fn === 'insights_vibe_radar_data' ? ok(RADAR_PAYLOAD) : ok(null))),
  });

  mockGetSupabaseFromRouteRequest.mockResolvedValue({
    supabase: mock.supabase,
    user: overrides.user ?? { id: MOCK_USER_ID },
    authError: null,
  });
  mockUserMayAccessBusinessInsights.mockResolvedValue(true);
  mockResolveInsightsVenueId.mockResolvedValue(MOCK_VENUE_ID);

  return mock;
}

function callRoute() {
  return intentsGet(new NextRequest('http://localhost/api/insights/intents'));
}

describe('GET /api/insights/intents contract', () => {
  beforeEach(() => {
    mockGetSupabaseFromRouteRequest.mockReset();
    mockUserMayAccessBusinessInsights.mockReset();
    mockResolveInsightsVenueId.mockReset();
  });

  // 1. SECURITY CONTROLS
  describe('Security Controls & Auth', () => {
    it('returns 401 Unauthorized when request lacks authentication', async () => {
      mockGetSupabaseFromRouteRequest.mockResolvedValue({
        supabase: {},
        user: null,
        authError: new Error('Unauthorized'),
      });

      const res = await callRoute();

      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toBe('Unauthorized');
    });

    it('returns 403 Forbidden when user is not eligible for business insights', async () => {
      mockGetSupabaseFromRouteRequest.mockResolvedValue({
        supabase: {},
        user: { id: MOCK_USER_ID },
        authError: null,
      });
      mockUserMayAccessBusinessInsights.mockResolvedValue(false);

      const res = await callRoute();

      expect(res.status).toBe(403);
      expect(mockResolveInsightsVenueId).not.toHaveBeenCalled();
    });

    it('returns 403 Forbidden when user is not a manager for the resolved venue', async () => {
      const mock = setupSupabase({ venueManagers: ok(null) });

      const res = await callRoute();

      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toBe('Not a manager for this venue');
      expect(mock.rpc).not.toHaveBeenCalled();
    });

    it('scopes the manager lookup to the resolved venue and the signed-in user', async () => {
      const mock = setupSupabase();

      await callRoute();

      const managers = mock.builder('venue_managers');
      expectFilter(managers, 'venue_id', MOCK_VENUE_ID);
      expectFilter(managers, 'user_id', MOCK_USER_ID);
      expectRpcCalledWith(mock.rpc, 'insights_vibe_radar_data', {
        venue_id_param: MOCK_VENUE_ID,
      });
    });

    it('returns 500 when the manager lookup itself fails', async () => {
      setupSupabase({ venueManagers: { data: null, error: { message: 'PostgREST down' } } });

      const res = await callRoute();

      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.error).toBe('Failed to verify access');
    });

    it('privacy check: drops user identifiers that ride along on cluster rows', async () => {
      setupSupabase({
        user: { id: MOCK_USER_ID, email: 'secret@domain.com' },
        rpc: (fn) => {
          if (fn === 'insights_vibe_radar_data') {
            return ok({
              ...RADAR_PAYLOAD,
              clusters: [
                {
                  hex_id: 'hex-1',
                  category: 'Coffee',
                  count: 12,
                  approx_lat: 47.601,
                  approx_lng: -122.301,
                  // Fields an over-broad RPC revision could start returning.
                  user_id: MOCK_USER_ID,
                  user_email: 'secret@domain.com',
                  member_ids: [MOCK_USER_ID],
                },
              ],
            });
          }
          return ok(null);
        },
      });

      const res = await callRoute();

      expect(res.status).toBe(200);
      const rawText = await res.text();

      // The cluster survived parsing — otherwise the assertions below prove nothing.
      expect(rawText).toContain('hex-1');
      expect(rawText).not.toContain(MOCK_USER_ID);
      expect(rawText).not.toContain('secret@domain.com');
      expect(rawText).not.toContain('user_id');
      expect(rawText).not.toContain('member_ids');
    });
  });

  // 2. FUNCTIONAL CORRECTNESS
  describe('Functional Correctness', () => {
    it('returns status "no_venue" when resolveInsightsVenueId returns null', async () => {
      const mock = setupSupabase();
      mockResolveInsightsVenueId.mockResolvedValue(null);

      const res = await callRoute();

      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.status).toBe('no_venue');
      expect(body.clusters).toEqual([]);
      expect(body.message).toContain('Link a venue');
      // Nothing is queried once there is no venue to scope to.
      expect(mock.from).not.toHaveBeenCalled();
      expect(mock.rpc).not.toHaveBeenCalled();
    });

    it('returns parsed Vibe Radar clusters and trending vibes when venue is resolved', async () => {
      const mock = setupSupabase({
        rpc: (fn) => {
          if (fn === 'insights_vibe_radar_data') return ok(RADAR_PAYLOAD);
          if (fn === 'insights_vibe_radar_beacon_density') {
            return ok({ trending: [{ beacon_type: 'soundtrack', count: 18 }] });
          }
          return ok(null);
        },
      });

      const res = await callRoute();

      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.venueId).toBe(MOCK_VENUE_ID);
      expect(body.status).toBe('ok');
      expect(body.clusters).toHaveLength(1);
      expect(body.clusters[0].hex_id).toBe('hex-abc');
      expect(body.categoryTotals[0].category).toBe('Drinks');
      expect(body.venueCenter).toEqual({ lat: 47.6062, lng: -122.3321 });
      expect(body.radiusMeters).toBe(200);
      expect(body.trendingVibes).toEqual([{ beacon_type: 'soundtrack', count: 18 }]);
      expectRpcCalledWith(mock.rpc, 'insights_vibe_radar_beacon_density', {
        venue_id_param: MOCK_VENUE_ID,
      });
    });

    it('returns 403 when the radar RPC rejects the caller as unauthorized', async () => {
      setupSupabase({
        rpc: (fn) =>
          fn === 'insights_vibe_radar_data'
            ? { data: null, error: { message: 'not authorized for venue' } }
            : ok(null),
      });

      const res = await callRoute();

      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toBe('Forbidden');
    });

    it('returns 500 when the radar RPC fails for a non-auth reason', async () => {
      setupSupabase({
        rpc: (fn) =>
          fn === 'insights_vibe_radar_data'
            ? { data: null, error: { message: 'statement timeout' } }
            : ok(null),
      });

      const res = await callRoute();

      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.error).toBe('Failed to load intent aggregates');
      expect(json.detail).toContain('statement timeout');
    });

    it('returns 500 when the route throws unexpectedly', async () => {
      mockGetSupabaseFromRouteRequest.mockRejectedValue(new Error('client boom'));

      const res = await callRoute();

      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.error).toBe('Internal Server Error');
    });
  });

  // 3. DATA INTEGRITY
  describe('Data Integrity & Edge Cases', () => {
    it('still serves clusters when the beacon density RPC fails', async () => {
      setupSupabase({
        rpc: (fn) => {
          if (fn === 'insights_vibe_radar_data') return ok(RADAR_PAYLOAD);
          if (fn === 'insights_vibe_radar_beacon_density') {
            return { data: null, error: { message: 'function does not exist' } };
          }
          return ok(null);
        },
      });

      const res = await callRoute();

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.clusters).toHaveLength(1);
      expect(body.trendingVibes).toBeUndefined();
    });

    it('falls back to a parse_error envelope when the RPC returns a non-object', async () => {
      setupSupabase({
        rpc: (fn) => (fn === 'insights_vibe_radar_data' ? ok('unexpected string') : ok(null)),
      });

      const res = await callRoute();

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe('parse_error');
      expect(body.clusters).toEqual([]);
      expect(body.venueCenter).toEqual({ lat: null, lng: null });
      expect(body.radiusMeters).toBe(160.934);
    });

    it('drops cluster rows that are missing required coordinates', async () => {
      setupSupabase({
        rpc: (fn) =>
          fn === 'insights_vibe_radar_data'
            ? ok({
                ...RADAR_PAYLOAD,
                clusters: [
                  ...RADAR_PAYLOAD.clusters,
                  { hex_id: 'hex-bad', category: 'Coffee', count: 3, approx_lat: null },
                  { category: 'Coffee', count: 3, approx_lat: 47.6, approx_lng: -122.3 },
                ],
              })
            : ok(null),
      });

      const res = await callRoute();

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.clusters.map((c: { hex_id: string }) => c.hex_id)).toEqual(['hex-abc']);
    });
  });

  // 4. PERFORMANCE LIMITS
  describe('Performance Limits', () => {
    it('parses 5,000 intent clusters in < 50ms', async () => {
      const largeClusters = Array.from({ length: 5000 }, (_, i) => ({
        hex_id: `hex-${i}`,
        category: i % 2 === 0 ? 'Coffee' : 'Live Music',
        count: i + 1,
        approx_lat: 47.6 + i * 0.0001,
        approx_lng: -122.3 - i * 0.0001,
      }));

      setupSupabase({
        rpc: (fn) =>
          fn === 'insights_vibe_radar_data'
            ? ok({
                ...RADAR_PAYLOAD,
                radiusMeters: 160.934,
                clusters: largeClusters,
                categoryTotals: [
                  { category: 'Coffee', count: 2500 },
                  { category: 'Live Music', count: 2500 },
                ],
              })
            : ok(null),
      });

      const startTime = performance.now();
      const res = await callRoute();
      const durationMs = performance.now() - startTime;

      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.clusters).toHaveLength(5000);
      expect(durationMs).toBeLessThan(50);
    });
  });
});
