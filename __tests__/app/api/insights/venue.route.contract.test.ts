/**
 * @jest-environment node
 */

import { NextRequest } from 'next/server';
import { GET as venueInsightsGet } from '@/app/api/insights/[venueId]/route';
import {
  expectFilter,
  filterCalls,
  makeSupabaseMock,
  rpcArgsFor,
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

const MOCK_USER_ID = 'user-mgr-1111-2222-3333';
const MOCK_VENUE_ID = 'venue-9999-8888-7777';

const ok = (data: unknown): QueryResult => ({ data, error: null });

type Overrides = {
  connections?: QueryResult;
  venues?: QueryResult;
  venueManagers?: QueryResult;
  encounters?: QueryResult;
  anchors?: QueryResult;
  rpc?: SupabaseMockOptions['rpc'];
};

/** Supabase mock for the happy path, with per-test overrides. */
function setupSupabase(overrides: Overrides = {}) {
  const mock = makeSupabaseMock({
    tables: {
      venue_managers: overrides.venueManagers ?? ok({ id: 'vm-1' }),
      venues:
        overrides.venues ??
        ok({
          id: MOCK_VENUE_ID,
          name: 'The Apex',
          location: '456 Market St',
          latitude: 37.77,
          longitude: -122.41,
        }),
      connections: overrides.connections ?? ok([]),
      connection_encounters: overrides.encounters ?? ok([]),
      nfc_anchors: overrides.anchors ?? ok([]),
    },
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
  const req = new NextRequest(`http://localhost/api/insights/${MOCK_VENUE_ID}`);
  return venueInsightsGet(req, { params: Promise.resolve({ venueId: MOCK_VENUE_ID }) });
}

describe('GET /api/insights/[venueId] contract', () => {
  beforeEach(() => {
    mockGetSupabaseFromRouteRequest.mockReset();
    mockUserMayAccessBusinessInsights.mockReset();
  });

  // 1. SECURITY CONTROLS
  describe('Security Controls & Auth', () => {
    it('returns 401 Unauthorized when request lacks valid authentication', async () => {
      mockGetSupabaseFromRouteRequest.mockResolvedValue({
        supabase: {},
        user: null,
        authError: new Error('Missing token'),
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
      const json = await res.json();
      expect(json.error).toContain('Forbidden');
    });

    it('returns 403 Forbidden when user is not a manager for the requested venue', async () => {
      setupSupabase({ venueManagers: ok(null) });

      const res = await callRoute();

      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toContain('Venue not found or not authorized');
    });

    it('scopes the manager lookup to both the requested venue and the signed-in user', async () => {
      const mock = setupSupabase();

      await callRoute();

      const managers = mock.builder('venue_managers');
      expectFilter(managers, 'venue_id', MOCK_VENUE_ID);
      expectFilter(managers, 'user_id', MOCK_USER_ID);
    });

    it('returns 500 when the manager lookup itself fails', async () => {
      setupSupabase({ venueManagers: { data: null, error: { message: 'PostgREST down' } } });

      const res = await callRoute();

      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.error).toBe('Failed to verify access');
    });

    it('returns 403 when the venue row is missing even though membership exists', async () => {
      setupSupabase({ venues: ok(null) });

      const res = await callRoute();

      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toContain('Venue not found or not authorized');
    });

    it('restricts the connections query to this venue and to consenting connections', async () => {
      const mock = setupSupabase({
        connections: ok([{ id: 'c1', created: Date.now(), expiry_state: 'kept' }]),
      });

      await callRoute();

      const connections = mock.builder('connections');
      expect(filterCalls(connections, 'or')).toContainEqual([
        `venue_id.eq.${MOCK_VENUE_ID},location_id.eq.${MOCK_VENUE_ID}`,
      ]);
      expectFilter(connections, 'include_in_business_insights', true);
      expectFilter(connections, 'source', 'handshake');
    });

    it('privacy check: strips user identifiers carried on the underlying rows', async () => {
      const now = Date.now();
      const mock = setupSupabase({
        connections: ok([
          {
            id: 'conn-1',
            created: now,
            expiry_state: 'kept',
            last_message_at: null,
            vibe_rating: 4,
            // Columns the route does not select, but which a widened `select('*')`
            // or a pass-through refactor would leak.
            user_ids: [MOCK_USER_ID, 'user-2'],
            owner_email: 'operator@example.com',
          },
        ]),
        encounters: ok([
          {
            connection_id: 'conn-1',
            location_name: 'Back patio',
            encountered_at: new Date(now).toISOString(),
            context_tags: ['live_music'],
            gps_lat: 37.77,
            gps_lon: -122.41,
            user_id: MOCK_USER_ID,
            user_email: 'operator@example.com',
          },
        ]),
        rpc: (fn) =>
          fn === 'insights_venue_micro_communities'
            ? ok([
                {
                  kind: 'micro_community',
                  attendeeCount: 4,
                  topTags: [{ tag: 'Tech', count: 3 }],
                  member_user_ids: [MOCK_USER_ID],
                },
              ])
            : ok(null),
      });

      mockGetSupabaseFromRouteRequest.mockResolvedValue({
        supabase: mock.supabase,
        user: { id: MOCK_USER_ID, email: 'operator@example.com' },
        authError: null,
      });

      const res = await callRoute();

      expect(res.status).toBe(200);
      const jsonText = await res.text();

      // The encounter actually reached the payload — otherwise this assertion is vacuous.
      expect(jsonText).toContain('Back patio');
      expect(jsonText).not.toContain(MOCK_USER_ID);
      expect(jsonText).not.toContain('operator@example.com');
      expect(jsonText).not.toContain('user_id');
      expect(jsonText).not.toContain('email');
    });
  });

  // 2. FUNCTIONAL CORRECTNESS
  describe('Functional Correctness', () => {
    it('returns aggregated venue statistics when request is authorized', async () => {
      const now = Date.now();
      const mock = setupSupabase({
        connections: ok([
          { id: 'c1', created: now, expiry_state: 'kept', last_message_at: null, vibe_rating: 4 },
          { id: 'c2', created: now - 86400000, expiry_state: 'kept', last_message_at: null, vibe_rating: 4 },
          { id: 'c3', created: now - 172800000, expiry_state: 'archived', last_message_at: null, vibe_rating: 2 },
        ]),
        rpc: (fn) => {
          if (fn === 'insights_venue_micro_communities') {
            return ok([
              { kind: 'micro_community', attendeeCount: 4, topTags: [{ tag: 'Tech', count: 3 }] },
            ]);
          }
          if (fn === 'get_venue_top_tags') {
            return ok([{ tag: 'Coffee', count: 9 }]);
          }
          return ok(null);
        },
      });

      const res = await callRoute();

      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.status).toBe('success');
      expect(body.venueName).toBe('The Apex');
      expect(body.venueLatitude).toBe(37.77);
      expect(body.venueLongitude).toBe(-122.41);
      expect(body.totalConnections).toBe(3);
      // 2 of 3 kept — exposed as a formatted string plus a rounded ratio.
      expect(body.retentionRate).toBe('66.7%');
      expect(body.keptRatio).toBe(0.67);
      expect(body.hourlyDistribution).toHaveLength(24);
      expect(body.hourlyDistribution.reduce((a: number, b: number) => a + b, 0)).toBe(3);
      expect(body.dailyData).toHaveLength(3);
      expect([...body.dailyData].sort((a: { date: string }, b: { date: string }) =>
        a.date.localeCompare(b.date),
      )).toEqual(body.dailyData);
      expect(body.peakHour).toBeGreaterThanOrEqual(0);
      expect(body.peakHour).toBeLessThan(24);
      expect(body.topTags).toEqual([{ tag: 'Coffee', count: 9 }]);
      expect(body.microCommunities).toHaveLength(1);
      expect(body.microCommunities[0].attendeeCount).toBe(4);
      expect(body.microCommunities[0].verifiedPairwiseClique).toBe(true);
      // Augmentation block is always present so the dashboard can render unconditionally.
      expect(Array.isArray(body.heatmapZones)).toBe(true);
      expect(body.liveCount.trend).toHaveLength(12);
      expect(body.connectionDensity).toEqual(
        expect.objectContaining({ totalArea: 2500, trend: 'stable' }),
      );
      expect(body.stickyScore.score).toBeGreaterThanOrEqual(0);

      // Top tags are looked up by the venue's semantic location, not its id.
      expect(rpcArgsFor(mock.rpc, 'get_venue_top_tags')).toEqual([
        { venue_location: '456 Market St' },
      ]);
      expect(rpcArgsFor(mock.rpc, 'insights_venue_micro_communities')).toEqual([
        { venue_id_param: MOCK_VENUE_ID },
      ]);
    });

    it('falls back to the venue name when the venue has no location string', async () => {
      const mock = setupSupabase({
        venues: ok({
          id: MOCK_VENUE_ID,
          name: 'The Apex',
          location: '   ',
          latitude: null,
          longitude: null,
        }),
      });

      const res = await callRoute();

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.venueLatitude).toBeNull();
      expect(body.venueLongitude).toBeNull();
      expect(rpcArgsFor(mock.rpc, 'get_venue_top_tags')).toEqual([
        { venue_location: 'The Apex' },
      ]);
    });

    it('returns 500 when the connections query fails', async () => {
      setupSupabase({
        connections: { data: null, error: { message: 'statement timeout' } },
      });

      const res = await callRoute();

      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.error).toBe('statement timeout');
    });
  });

  // 3. DATA INTEGRITY
  describe('Data Integrity & Robustness', () => {
    it('handles a venue with no connections gracefully', async () => {
      const mock = setupSupabase({ connections: ok([]) });

      const res = await callRoute();

      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.totalConnections).toBe(0);
      expect(body.retentionRate).toBe('0%');
      expect(body.keptRatio).toBe(0);
      expect(body.dailyData).toEqual([]);
      expect(body.hourlyDistribution).toEqual(new Array(24).fill(0));
      expect(body.microCommunities).toEqual([]);
      expect(body.connectionEncounterCoordinates).toEqual([]);
      // No connection ids means the encounter query is skipped entirely.
      expect(mock.from).not.toHaveBeenCalledWith('connection_encounters');
    });

    it('degrades to an empty list when the micro-communities RPC fails', async () => {
      setupSupabase({
        connections: ok([{ id: 'c1', created: Date.now(), expiry_state: 'kept' }]),
        rpc: (fn) =>
          fn === 'insights_venue_micro_communities'
            ? { data: null, error: { message: 'function does not exist' } }
            : ok(null),
      });

      const res = await callRoute();

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.microCommunities).toEqual([]);
      expect(body.status).toBe('success');
    });

    it('tolerates rows with non-numeric timestamps', async () => {
      setupSupabase({
        connections: ok([
          { id: 'c1', created: null, expiry_state: 'kept' },
          { id: 'c2', created: 'not-a-timestamp', expiry_state: 'archived' },
        ]),
      });

      const res = await callRoute();

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.totalConnections).toBe(2);
      expect(body.hourlyDistribution).toHaveLength(24);
    });
  });

  // 4. PERFORMANCE LIMITS
  describe('Performance Limits', () => {
    it('processes 5,000 connection rows within performance limit (< 100ms)', async () => {
      const now = Date.now();
      const largeConnectionSet = Array.from({ length: 5000 }, (_, i) => ({
        id: `conn-${i}`,
        created: now - (i % 30) * 86400000,
        expiry_state: i % 2 === 0 ? 'kept' : 'archived',
        last_message_at: null,
        vibe_rating: i % 3 === 0 ? 5 : 3,
      }));

      setupSupabase({ connections: ok(largeConnectionSet) });

      const startTime = performance.now();
      const res = await callRoute();
      const durationMs = performance.now() - startTime;

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.totalConnections).toBe(5000);
      expect(body.keptRatio).toBe(0.5);
      expect(durationMs).toBeLessThan(100);
    });
  });
});
