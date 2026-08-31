/**
 * @jest-environment node
 */

import { NextRequest } from 'next/server';
import { GET as advancedMetricsGet } from '@/app/api/insights/[venueId]/advanced-metrics/route';
import {
  expectFilter,
  expectRpcCalledWith,
  makeSupabaseMock,
  type QueryResult,
  type SupabaseMockOptions,
} from '../../../helpers/supabaseRouteMocks';

const mockGetSupabaseFromRouteRequest = jest.fn();
const mockUserMayAccessBusinessInsights = jest.fn();

jest.mock('@/lib/server/supabaseRouteAuth', () => ({
  getSupabaseFromRouteRequest: (...args: unknown[]) => mockGetSupabaseFromRouteRequest(...args),
}));

jest.mock('@/lib/server/businessInsightsEligibility', () => ({
  userMayAccessBusinessInsights: (...args: unknown[]) => mockUserMayAccessBusinessInsights(...args),
}));

const MOCK_USER_ID = 'user-mgr-5555';
const MOCK_VENUE_ID = 'venue-4444';

/** Every metric RPC the route fans out to, in the order it awaits them. */
const METRIC_RPCS = [
  'calculate_vlc',
  'calculate_ams',
  'calculate_acr',
  'calculate_cpr',
  'calculate_wri',
  'calculate_psv',
  'calculate_gcr',
];

const ok = (data: unknown): QueryResult => ({ data, error: null });

function setupSupabase(
  overrides: { venueManagers?: QueryResult; rpc?: SupabaseMockOptions['rpc'] } = {},
) {
  const mock = makeSupabaseMock({
    tables: { venue_managers: overrides.venueManagers ?? ok({ id: 'vm-1' }) },
    rpc: overrides.rpc,
  });

  mockGetSupabaseFromRouteRequest.mockResolvedValue({
    supabase: mock.supabase,
    user: { id: MOCK_USER_ID },
    authError: null,
  });
  mockUserMayAccessBusinessInsights.mockResolvedValue(true);

  return mock;
}

function callRoute() {
  const req = new NextRequest(`http://localhost/api/insights/${MOCK_VENUE_ID}/advanced-metrics`);
  return advancedMetricsGet(req, { params: Promise.resolve({ venueId: MOCK_VENUE_ID }) });
}

describe('GET /api/insights/[venueId]/advanced-metrics contract', () => {
  beforeEach(() => {
    mockGetSupabaseFromRouteRequest.mockReset();
    mockUserMayAccessBusinessInsights.mockReset();
  });

  // 1. SECURITY CONTROLS
  describe('Security Controls & Auth', () => {
    it('returns 401 Unauthorized when unauthenticated', async () => {
      mockGetSupabaseFromRouteRequest.mockResolvedValue({
        supabase: {},
        user: null,
        authError: new Error('Unauthenticated'),
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
    });

    it('returns 403 Forbidden when user is not a manager for the venue', async () => {
      const mock = setupSupabase({ venueManagers: ok(null) });

      const res = await callRoute();

      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toBe('Not a manager for this venue');
      // No metrics are computed for a non-manager.
      expect(mock.rpc).not.toHaveBeenCalled();
    });

    it('scopes the manager lookup to both the requested venue and the signed-in user', async () => {
      const mock = setupSupabase();

      await callRoute();

      const managers = mock.builder('venue_managers');
      expectFilter(managers, 'venue_id', MOCK_VENUE_ID);
      expectFilter(managers, 'user_id', MOCK_USER_ID);
    });

    it('returns 500 when the manager lookup itself fails', async () => {
      setupSupabase({
        venueManagers: { data: null, error: { message: 'connection reset' } },
      });

      const res = await callRoute();

      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.error).toBe('Failed to verify access');
    });

    it('returns 403 Forbidden when an RPC rejects the caller as unauthorized', async () => {
      setupSupabase({
        rpc: (fn) =>
          fn === 'calculate_vlc'
            ? { data: null, error: { message: 'not authorized to execute RPC' } }
            : ok(null),
      });

      const res = await callRoute();

      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toBe('Forbidden');
    });

    it('passes only the requested venue id to every metric RPC', async () => {
      const mock = setupSupabase();

      await callRoute();

      for (const fn of [...METRIC_RPCS, 'insights_peer_percentiles']) {
        expectRpcCalledWith(mock.rpc, fn, { venue_id_param: MOCK_VENUE_ID });
      }
    });
  });

  // 2. FUNCTIONAL CORRECTNESS
  describe('Functional Correctness', () => {
    it('aggregates and parses all advanced ROI RPC metrics correctly', async () => {
      setupSupabase({
        rpc: (fn) => {
          switch (fn) {
            case 'calculate_vlc':
              return ok(0.85);
            case 'calculate_ams':
              return ok([
                {
                  nfc_anchor_id: 'anc-1',
                  name: 'Main Entrance',
                  connection_count: 50,
                  total_count: 100,
                  anchor_retention: 0.5,
                  ams_score: 82.5,
                },
              ]);
            case 'calculate_acr':
              return ok({ quiet: 90, moderate: 65, loud: 40 });
            case 'calculate_cpr':
              return ok(0.42);
            case 'calculate_wri':
              return ok({
                index: 1.15,
                avg_daily_adverse: 23,
                avg_daily_fair: 20,
                adverse_days: 5,
                fair_days: 25,
              });
            case 'calculate_psv':
              return ok({
                peak_hour: 21,
                velocity: 14.2,
                hourly_averages: Array(24).fill(5),
                num_distinct_days: 30,
                total_connections: 450,
              });
            case 'calculate_gcr':
              return ok(0.35);
            case 'insights_peer_percentiles':
              return ok({ cohortSize: 12, vlc: 88, gcr: 75, psv_velocity: 90, wri: 60 });
            default:
              return ok(null);
          }
        },
      });

      const res = await callRoute();

      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.venueId).toBe(MOCK_VENUE_ID);
      expect(body.venueLoyaltyCoefficient).toBe(0.85);
      expect(body.anchorMagnetism).toHaveLength(1);
      expect(body.anchorMagnetism[0].nfc_anchor_id).toBe('anc-1');
      expect(body.acousticConversion).toEqual({ quiet: 90, moderate: 65, loud: 40 });
      expect(body.crossPollinationRate).toBe(0.42);
      expect(body.weatherResilience.index).toBe(1.15);
      expect(body.peakSocialVelocity.peakHour).toBe(21);
      expect(body.groupClusteringRate).toBe(0.35);
      expect(body.peerPercentiles).toEqual({
        cohortSize: 12,
        vlc: 88,
        gcr: 75,
        psv_velocity: 90,
        wri: 60,
      });
    });

    it('returns 500 Metrics unavailable when a metric RPC fails for a non-auth reason', async () => {
      setupSupabase({
        rpc: (fn) =>
          fn === 'calculate_psv'
            ? { data: null, error: { message: 'division by zero' } }
            : ok(null),
      });

      const res = await callRoute();

      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.error).toBe('Metrics unavailable');
      expect(json.detail).toContain('division by zero');
    });

    it('reports every failing metric RPC, not just the first', async () => {
      setupSupabase({
        rpc: (fn) => {
          if (fn === 'calculate_vlc') return { data: null, error: { message: 'vlc exploded' } };
          if (fn === 'calculate_gcr') return { data: null, error: { message: 'gcr exploded' } };
          return ok(null);
        },
      });

      const res = await callRoute();

      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.detail).toContain('vlc exploded');
      expect(json.detail).toContain('gcr exploded');
    });

    it('returns 500 when the route throws unexpectedly', async () => {
      mockGetSupabaseFromRouteRequest.mockRejectedValue(new Error('supabase client boom'));

      const res = await callRoute();

      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.error).toBe('Internal server error');
    });
  });

  // 3. DATA INTEGRITY
  describe('Data Integrity & Edge Cases', () => {
    it('handles missing or malformed RPC data gracefully without crashing', async () => {
      setupSupabase({
        rpc: (fn) =>
          fn === 'insights_peer_percentiles'
            ? { data: null, error: { message: 'RPC missing on legacy DB' } }
            : ok(null),
      });

      const res = await callRoute();

      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.venueLoyaltyCoefficient).toBe(0);
      expect(body.anchorMagnetism).toEqual([]);
      expect(body.acousticConversion).toEqual({});
      expect(body.weatherResilience.index).toBeNull();
      expect(body.peakSocialVelocity.hourlyAverages).toHaveLength(24);
      expect(body.peerPercentiles).toBeNull();
    });

    it('coerces partially populated anchor rows to safe defaults', async () => {
      setupSupabase({
        rpc: (fn) =>
          fn === 'calculate_ams'
            ? ok([
                {
                  nfc_anchor_id: 'anc-ok',
                  name: 'Bar',
                  connection_count: 3,
                  total_count: 9,
                  anchor_retention: 0.33,
                  ams_score: 40,
                },
                { nfc_anchor_id: 'anc-partial' },
              ])
            : ok(null),
      });

      const res = await callRoute();

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.anchorMagnetism).toHaveLength(2);
      expect(body.anchorMagnetism[1]).toEqual({
        nfc_anchor_id: 'anc-partial',
        name: '',
        connection_count: 0,
        total_count: 0,
        anchor_retention: 0,
        ams_score: 0,
      });
    });
  });

  // 4. PERFORMANCE LIMITS
  describe('Performance Limits', () => {
    it('processes 5,000 anchor magnetism rows in < 50ms', async () => {
      const largeAmsData = Array.from({ length: 5000 }, (_, i) => ({
        nfc_anchor_id: `anc-${i}`,
        name: `Anchor ${i}`,
        connection_count: i * 2,
        total_count: i * 5,
        anchor_retention: 0.4,
        ams_score: 75.0,
      }));

      setupSupabase({
        rpc: (fn) => (fn === 'calculate_ams' ? ok(largeAmsData) : ok(null)),
      });

      const startTime = performance.now();
      const res = await callRoute();
      const durationMs = performance.now() - startTime;

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.anchorMagnetism).toHaveLength(5000);
      expect(durationMs).toBeLessThan(50);
    });
  });
});
