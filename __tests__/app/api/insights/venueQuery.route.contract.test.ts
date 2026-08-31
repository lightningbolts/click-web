/**
 * @jest-environment node
 */

import { NextRequest } from 'next/server';
import { GET as venueQueryGet } from '@/app/api/insights/venue/route';
import {
  expectFilter,
  filterCalls,
  makeSupabaseMock,
  type QueryResult,
} from '../../../helpers/supabaseRouteMocks';

const mockGetSupabaseFromRouteRequest = jest.fn();
const mockUserMayAccessBusinessInsights = jest.fn();

jest.mock('@/lib/server/supabaseRouteAuth', () => ({
  getSupabaseFromRouteRequest: (...args: unknown[]) => mockGetSupabaseFromRouteRequest(...args),
}));

jest.mock('@/lib/server/businessInsightsEligibility', () => ({
  userMayAccessBusinessInsights: (...args: unknown[]) => mockUserMayAccessBusinessInsights(...args),
}));

const MOCK_USER_ID = 'user-mgr-3030';
const MOCK_VENUE_ID = 'venue-2020';

const ok = (data: unknown): QueryResult => ({ data, error: null });

/** `insights/venue` only reports on venues with at least five recent connections. */
function connectionRows(count: number, keptCount: number) {
  const now = Date.now();
  return Array.from({ length: count }, (_, i) => ({
    id: `conn-${i}`,
    created: now - i * 3600000,
    expiry_state: i < keptCount ? 'kept' : 'archived',
    last_message_at: null,
    vibe_rating: 4,
  }));
}

type Overrides = {
  venueManagers?: QueryResult;
  venues?: QueryResult;
  connections?: QueryResult;
  user?: Record<string, unknown>;
};

function setupSupabase(overrides: Overrides = {}) {
  const mock = makeSupabaseMock({
    tables: {
      venue_managers: overrides.venueManagers ?? ok({ id: 'vm-1' }),
      venues: overrides.venues ?? ok({ id: MOCK_VENUE_ID, name: 'Nova Bar', location: '9 Pike St' }),
      connections: overrides.connections ?? ok(connectionRows(6, 3)),
      connection_encounters: ok([]),
      nfc_anchors: ok([]),
    },
  });

  mockGetSupabaseFromRouteRequest.mockResolvedValue({
    supabase: mock.supabase,
    user: overrides.user ?? { id: MOCK_USER_ID },
    authError: null,
  });
  mockUserMayAccessBusinessInsights.mockResolvedValue(true);

  return mock;
}

function callRoute(query = `?venue_id=${MOCK_VENUE_ID}`) {
  return venueQueryGet(new NextRequest(`http://localhost/api/insights/venue${query}`));
}

describe('GET /api/insights/venue contract', () => {
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
        authError: new Error('Missing session'),
      });

      const res = await callRoute();

      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toBe('Unauthorized');
    });

    it('returns 403 Forbidden when user is not eligible for business insights', async () => {
      const mock = setupSupabase();
      mockUserMayAccessBusinessInsights.mockResolvedValue(false);

      const res = await callRoute();

      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toContain('Forbidden');
      expect(mock.from).not.toHaveBeenCalled();
    });

    it('returns 403 when the caller does not manage the requested venue', async () => {
      const mock = setupSupabase({ venueManagers: ok(null) });

      const res = await callRoute();

      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toBe('Not a manager for this venue');
      // The venue row is never read for a non-manager.
      expect(mock.from).not.toHaveBeenCalledWith('venues');
    });

    it('cannot be pointed at another venue by query string alone', async () => {
      const mock = setupSupabase({ venueManagers: ok(null) });

      const res = await callRoute('?venue_id=someone-elses-venue');

      expect(res.status).toBe(403);
      const managers = mock.builder('venue_managers');
      expectFilter(managers, 'venue_id', 'someone-elses-venue');
      expectFilter(managers, 'user_id', MOCK_USER_ID);
    });

    it('returns 500 when the manager lookup itself fails', async () => {
      setupSupabase({ venueManagers: { data: null, error: { message: 'PostgREST down' } } });

      const res = await callRoute();

      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.error).toBe('Failed to verify access');
    });

    it('restricts the connections query to the venue, consent flag, and last 30 days', async () => {
      const before = Date.now() - 30 * 86400000;
      const mock = setupSupabase();

      await callRoute();

      const after = Date.now() - 30 * 86400000;
      const connections = mock.builder('connections');
      expect(filterCalls(connections, 'or')).toContainEqual([
        `venue_id.eq.${MOCK_VENUE_ID},location_id.eq.${MOCK_VENUE_ID}`,
      ]);
      expectFilter(connections, 'include_in_business_insights', true);
      expectFilter(connections, 'source', 'handshake');

      const [gtColumn, gtValue] = filterCalls(connections, 'gt')[0];
      expect(gtColumn).toBe('created');
      expect(gtValue).toBeGreaterThanOrEqual(before);
      expect(gtValue).toBeLessThanOrEqual(after);
    });

    it('privacy check: response carries no user identifiers', async () => {
      setupSupabase({
        user: { id: MOCK_USER_ID, email: 'manager@example.com' },
        connections: ok(
          connectionRows(6, 3).map((row) => ({
            ...row,
            user_ids: [MOCK_USER_ID, 'user-other'],
          })),
        ),
      });

      const res = await callRoute();

      expect(res.status).toBe(200);
      const rawText = await res.text();
      expect(rawText).not.toContain(MOCK_USER_ID);
      expect(rawText).not.toContain('manager@example.com');
      expect(rawText).not.toContain('user_id');
    });
  });

  // 2. VENUE RESOLUTION
  describe('Venue Resolution', () => {
    it('returns the no_venue envelope when neither query nor user metadata names a venue', async () => {
      const mock = setupSupabase();

      const res = await callRoute('');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe('no_venue');
      expect(body.message).toContain('Link a venue');
      expect(body.totalConnections).toBe(0);
      expect(body.hourlyDistribution).toEqual(new Array(24).fill(0));
      expect(body.retentionRate).toBe('0%');
      expect(body.busiestDay).toBe('N/A');
      expect(body.heatmapZones).toEqual([]);
      expect(body.liveCount.trend).toHaveLength(12);
      expect(mock.from).not.toHaveBeenCalled();
    });

    it('falls back to the venue id on user metadata', async () => {
      const mock = setupSupabase({
        user: { id: MOCK_USER_ID, user_metadata: { venue_id: 'venue-from-metadata' } },
      });

      await callRoute('');

      expectFilter(mock.builder('venue_managers'), 'venue_id', 'venue-from-metadata');
    });

    it('prefers the explicit query parameter over user metadata', async () => {
      const mock = setupSupabase({
        user: { id: MOCK_USER_ID, user_metadata: { venue_id: 'venue-from-metadata' } },
      });

      await callRoute(`?venue_id=${MOCK_VENUE_ID}`);

      expectFilter(mock.builder('venue_managers'), 'venue_id', MOCK_VENUE_ID);
    });

    it('returns 404 when the venue row is missing', async () => {
      setupSupabase({ venues: ok(null) });

      const res = await callRoute();

      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.error).toBe('Venue not found');
    });
  });

  // 3. FUNCTIONAL CORRECTNESS
  describe('Functional Correctness', () => {
    it('returns aggregated stats once the venue clears the reporting threshold', async () => {
      setupSupabase({ connections: ok(connectionRows(6, 3)) });

      const res = await callRoute();

      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.venueName).toBe('Nova Bar');
      expect(body.totalConnections).toBe(6);
      expect(body.retentionRate).toBe('50.0%');
      expect(body.hourlyDistribution).toHaveLength(24);
      expect(body.hourlyDistribution.reduce((a: number, b: number) => a + b, 0)).toBe(6);
      expect(body.peakHour).toBeGreaterThanOrEqual(0);
      expect(body.peakHour).toBeLessThan(24);
      expect(body.dailyData.length).toBeGreaterThan(0);
      // Busiest day is rendered for display, e.g. "Monday, Aug 10".
      expect(body.busiestDay).toMatch(/^[A-Z][a-z]+, [A-Z][a-z]{2} \d{1,2}$/);
      expect(body.stickyScore.score).toBeGreaterThan(0);
      expect(body.connectionDensity.activeZones).toBeGreaterThanOrEqual(1);
    });

    it('falls back to "Venue" when the venue row has a blank name', async () => {
      setupSupabase({ venues: ok({ id: MOCK_VENUE_ID, name: '   ', location: null }) });

      const res = await callRoute();

      const body = await res.json();
      expect(body.venueName).toBe('Venue');
    });

    it('returns 500 when the connections query fails', async () => {
      setupSupabase({ connections: { data: null, error: { message: 'statement timeout' } } });

      const res = await callRoute();

      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.error).toBe('Failed to fetch data');
    });

    it('returns 500 when the route throws unexpectedly', async () => {
      mockGetSupabaseFromRouteRequest.mockRejectedValue(new Error('client boom'));

      const res = await callRoute();

      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.error).toBe('Internal Server Error');
    });
  });

  // 4. K-ANONYMITY THRESHOLD
  describe('Small-sample suppression', () => {
    it.each([0, 1, 4])(
      'suppresses stats and returns insufficient_data for %i connections',
      async (count) => {
        setupSupabase({ connections: ok(connectionRows(count, count)) });

        const res = await callRoute();

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.status).toBe('insufficient_data');
        expect(body.message).toContain('Less than 5 connections');
        // No derived stats leak alongside the suppression notice.
        expect(body.totalConnections).toBeUndefined();
        expect(body.dailyData).toBeUndefined();
        expect(body.heatmapZones).toEqual([]);
      },
    );

    it('reports normally at exactly the 5-connection threshold', async () => {
      setupSupabase({ connections: ok(connectionRows(5, 5)) });

      const res = await callRoute();

      const body = await res.json();
      expect(body.status).toBeUndefined();
      expect(body.totalConnections).toBe(5);
      expect(body.retentionRate).toBe('100.0%');
    });
  });
});
