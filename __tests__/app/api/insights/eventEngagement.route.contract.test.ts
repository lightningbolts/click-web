/**
 * @jest-environment node
 */

import { NextRequest } from 'next/server';
import { GET as eventEngagementGet } from '@/app/api/insights/[venueId]/event-engagement/route';
import {
  expectFilter,
  filterCalls,
  makeSupabaseMock,
  type QueryResult,
} from '../../../helpers/supabaseRouteMocks';

const mockGetSupabaseFromRouteRequest = jest.fn();
const mockUserMayAccessBusinessInsights = jest.fn();
const mockCreateAdminSupabaseClient = jest.fn();

jest.mock('@/lib/server/supabaseRouteAuth', () => ({
  getSupabaseFromRouteRequest: (...args: unknown[]) => mockGetSupabaseFromRouteRequest(...args),
}));

jest.mock('@/lib/server/businessInsightsEligibility', () => ({
  userMayAccessBusinessInsights: (...args: unknown[]) => mockUserMayAccessBusinessInsights(...args),
}));

jest.mock('@/lib/server/admin/supabaseAdmin', () => ({
  createAdminSupabaseClient: (...args: unknown[]) => mockCreateAdminSupabaseClient(...args),
}));

const MOCK_USER_ID = 'user-mgr-8080';
const MOCK_VENUE_ID = 'venue-7070';

const ok = (data: unknown): QueryResult => ({ data, error: null });

const T0 = Date.parse('2026-08-12T20:00:00.000Z');
const iso = (offsetMinutes: number) => new Date(T0 + offsetMinutes * 60_000).toISOString();

function setupSupabase(
  overrides: { venueManagers?: QueryResult; events?: QueryResult } = {},
) {
  const auth = makeSupabaseMock({
    tables: { venue_managers: overrides.venueManagers ?? ok({ id: 'vm-1' }) },
  });
  const admin = makeSupabaseMock({
    tables: { event_engagement_events: overrides.events ?? ok([]) },
  });

  mockGetSupabaseFromRouteRequest.mockResolvedValue({
    supabase: auth.supabase,
    user: { id: MOCK_USER_ID },
    authError: null,
  });
  mockUserMayAccessBusinessInsights.mockResolvedValue(true);
  mockCreateAdminSupabaseClient.mockReturnValue(admin.supabase);

  return { auth, admin };
}

function callRoute() {
  return eventEngagementGet(
    new NextRequest(`http://localhost/api/insights/${MOCK_VENUE_ID}/event-engagement`),
    { params: Promise.resolve({ venueId: MOCK_VENUE_ID }) },
  );
}

describe('GET /api/insights/[venueId]/event-engagement contract', () => {
  beforeEach(() => {
    mockGetSupabaseFromRouteRequest.mockReset();
    mockUserMayAccessBusinessInsights.mockReset();
    mockCreateAdminSupabaseClient.mockReset();
  });

  // 1. SECURITY CONTROLS
  //
  // This route reads through the service-role client, so RLS is bypassed and the
  // manager check below is the *only* thing standing between a caller and another
  // venue's data. Each failure path asserts the admin client is never constructed.
  describe('Security Controls & Auth', () => {
    it('returns 401 Unauthorized when unauthenticated', async () => {
      mockGetSupabaseFromRouteRequest.mockResolvedValue({
        supabase: {},
        user: null,
        authError: new Error('Missing session'),
      });

      const res = await callRoute();

      expect(res.status).toBe(401);
      expect((await res.json()).error).toBe('Unauthorized');
      expect(mockCreateAdminSupabaseClient).not.toHaveBeenCalled();
    });

    it('returns 403 when the user is not eligible for business insights', async () => {
      setupSupabase();
      mockUserMayAccessBusinessInsights.mockResolvedValue(false);

      const res = await callRoute();

      expect(res.status).toBe(403);
      expect(mockCreateAdminSupabaseClient).not.toHaveBeenCalled();
    });

    it('returns 403 when the user does not manage the venue', async () => {
      setupSupabase({ venueManagers: ok(null) });

      const res = await callRoute();

      expect(res.status).toBe(403);
      expect((await res.json()).error).toBe('Not a manager for this venue');
      expect(mockCreateAdminSupabaseClient).not.toHaveBeenCalled();
    });

    it('returns 500 when the manager lookup itself fails', async () => {
      setupSupabase({ venueManagers: { data: null, error: { message: 'PostgREST down' } } });

      const res = await callRoute();

      expect(res.status).toBe(500);
      expect((await res.json()).error).toBe('Failed to verify access');
      expect(mockCreateAdminSupabaseClient).not.toHaveBeenCalled();
    });

    it('scopes the manager lookup and the service-role read to venue and user', async () => {
      const { auth, admin } = setupSupabase();

      await callRoute();

      const managers = auth.builder('venue_managers');
      expectFilter(managers, 'venue_id', MOCK_VENUE_ID);
      expectFilter(managers, 'user_id', MOCK_USER_ID);

      const events = admin.builder('event_engagement_events');
      expectFilter(events, 'venue_id', MOCK_VENUE_ID);
      expect(filterCalls(events, 'limit')).toEqual([[5000]]);
      expect(filterCalls(events, 'order')).toEqual([
        ['occurred_at', { ascending: false }],
      ]);
    });

    it('privacy check: aggregates viewers without echoing their user ids', async () => {
      setupSupabase({
        events: ok([
          { event_type: 'event_view', user_id: MOCK_USER_ID, beacon_id: 'b1', occurred_at: iso(0) },
          { event_type: 'event_view', user_id: 'user-attendee-2', beacon_id: 'b1', occurred_at: iso(1) },
        ]),
      });

      const res = await callRoute();

      expect(res.status).toBe(200);
      const rawText = await res.text();
      const body = JSON.parse(rawText);

      expect(body.funnel.unique_viewers).toBe(2);
      expect(rawText).not.toContain(MOCK_USER_ID);
      expect(rawText).not.toContain('user-attendee-2');
      expect(rawText).not.toContain('beacon_id');
    });
  });

  // 2. FUNCTIONAL CORRECTNESS
  describe('Funnel Aggregation', () => {
    it('counts each event type and derives conversion rates', async () => {
      setupSupabase({
        events: ok([
          { event_type: 'event_view', user_id: 'u1', beacon_id: 'b1', occurred_at: iso(0) },
          { event_type: 'event_view', user_id: 'u1', beacon_id: 'b1', occurred_at: iso(1) },
          { event_type: 'event_view', user_id: 'u2', beacon_id: 'b1', occurred_at: iso(2) },
          { event_type: 'event_view', user_id: 'u3', beacon_id: 'b1', occurred_at: iso(3) },
          { event_type: 'bookmark_set', user_id: 'u1', beacon_id: 'b1', occurred_at: iso(4) },
          { event_type: 'share', user_id: 'u2', beacon_id: 'b1', occurred_at: iso(5) },
          { event_type: 'rsvp_set', user_id: 'u1', beacon_id: 'b1', occurred_at: iso(6) },
          { event_type: 'rsvp_set', user_id: 'u2', beacon_id: 'b1', occurred_at: iso(7) },
          { event_type: 'check_in', user_id: 'u1', beacon_id: 'b1', occurred_at: iso(8), minutes_after_start: -5 },
          { event_type: 'check_in', user_id: 'u2', beacon_id: 'b1', occurred_at: iso(9), minutes_after_start: 10 },
          { event_type: 'check_in', user_id: 'u3', beacon_id: 'b1', occurred_at: iso(10), minutes_after_start: 45 },
          { event_type: 'check_in', user_id: 'u4', beacon_id: 'b1', occurred_at: iso(11), minutes_after_start: 90 },
          { event_type: 'check_in', user_id: 'u5', beacon_id: 'b1', occurred_at: iso(12), minutes_after_start: null },
          { event_type: 'check_out', user_id: 'u1', beacon_id: 'b1', occurred_at: iso(60) },
          { event_type: 'check_in_rejected', user_id: 'u6', beacon_id: 'b1', occurred_at: iso(13), reject_reason: 'too_far' },
          { event_type: 'check_in_rejected', user_id: 'u7', beacon_id: 'b1', occurred_at: iso(14), reject_reason: 'too_far' },
          { event_type: 'check_in_rejected', user_id: 'u8', beacon_id: 'b1', occurred_at: iso(15) },
          // Unknown types are ignored rather than miscounted.
          { event_type: 'some_future_event', user_id: 'u9', beacon_id: 'b1', occurred_at: iso(16) },
          'not-a-row',
        ]),
      });

      const res = await callRoute();

      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.venue_id).toBe(MOCK_VENUE_ID);
      expect(body.funnel).toEqual({
        impressions: 4,
        unique_viewers: 3,
        bookmarks: 1,
        shares: 1,
        rsvps: 2,
        check_ins: 5,
        check_outs: 1,
        interest_rate: 0.25,
        share_rate: 0.25,
        rsvp_conversion: 0.5,
        rsvp_to_check_in: 2.5,
      });

      expect(body.arrival_histogram).toEqual([
        { bucket: 'early', count: 1 },
        { bucket: '0_30', count: 1 },
        { bucket: '30_60', count: 1 },
        { bucket: '60_plus', count: 1 },
        { bucket: 'unknown', count: 1 },
      ]);

      expect(body.reject_reasons).toEqual(
        expect.arrayContaining([
          { reason: 'too_far', count: 2 },
          { reason: 'unknown', count: 1 },
        ]),
      );
      expect(body.reject_reasons).toHaveLength(2);
    });

    it('sorts arrival minutes into the correct bucket at each boundary', async () => {
      setupSupabase({
        events: ok([
          { event_type: 'check_in', user_id: 'u1', beacon_id: 'b1', occurred_at: iso(0), minutes_after_start: 0 },
          { event_type: 'check_in', user_id: 'u2', beacon_id: 'b1', occurred_at: iso(0), minutes_after_start: 30 },
          { event_type: 'check_in', user_id: 'u3', beacon_id: 'b1', occurred_at: iso(0), minutes_after_start: 31 },
          { event_type: 'check_in', user_id: 'u4', beacon_id: 'b1', occurred_at: iso(0), minutes_after_start: 60 },
          { event_type: 'check_in', user_id: 'u5', beacon_id: 'b1', occurred_at: iso(0), minutes_after_start: 61 },
        ]),
      });

      const res = await callRoute();

      const body = await res.json();
      expect(body.arrival_histogram).toEqual([
        { bucket: 'early', count: 0 },
        { bucket: '0_30', count: 2 },
        { bucket: '30_60', count: 2 },
        { bucket: '60_plus', count: 1 },
        { bucket: 'unknown', count: 0 },
      ]);
    });

    it('returns null rates rather than dividing by zero when there is no traffic', async () => {
      setupSupabase({ events: ok([]) });

      const res = await callRoute();

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.funnel).toEqual({
        impressions: 0,
        unique_viewers: 0,
        bookmarks: 0,
        shares: 0,
        rsvps: 0,
        check_ins: 0,
        check_outs: 0,
        interest_rate: null,
        share_rate: null,
        rsvp_conversion: null,
        rsvp_to_check_in: null,
      });
      expect(body.reject_reasons).toEqual([]);
      expect(body.dwell).toEqual({ sample_size: 0, p50_minutes: null, p90_minutes: null });
    });

    it('returns 500 when the engagement query fails', async () => {
      setupSupabase({ events: { data: null, error: { message: 'statement timeout' } } });

      const res = await callRoute();

      expect(res.status).toBe(500);
      expect((await res.json()).error).toBe('Failed to load engagement');
    });

    it('returns 500 when the route throws unexpectedly', async () => {
      mockGetSupabaseFromRouteRequest.mockRejectedValue(new Error('client boom'));

      const res = await callRoute();

      expect(res.status).toBe(500);
      expect((await res.json()).error).toBe('Internal Server Error');
    });
  });

  // 3. DWELL TIME
  describe('Dwell Time', () => {
    it('pairs a check-out with its check-in and reports percentiles', async () => {
      setupSupabase({
        events: ok([
          { event_type: 'check_in', user_id: 'u1', beacon_id: 'b1', occurred_at: iso(0) },
          { event_type: 'check_out', user_id: 'u1', beacon_id: 'b1', occurred_at: iso(10) },
          { event_type: 'check_in', user_id: 'u2', beacon_id: 'b1', occurred_at: iso(0) },
          { event_type: 'check_out', user_id: 'u2', beacon_id: 'b1', occurred_at: iso(20) },
          { event_type: 'check_in', user_id: 'u3', beacon_id: 'b1', occurred_at: iso(0) },
          { event_type: 'check_out', user_id: 'u3', beacon_id: 'b1', occurred_at: iso(30) },
          { event_type: 'check_in', user_id: 'u4', beacon_id: 'b1', occurred_at: iso(0) },
          { event_type: 'check_out', user_id: 'u4', beacon_id: 'b1', occurred_at: iso(40) },
        ]),
      });

      const res = await callRoute();

      const body = await res.json();
      expect(body.dwell).toEqual({ sample_size: 4, p50_minutes: 20, p90_minutes: 40 });
    });

    it('ignores a check-out with no matching check-in', async () => {
      setupSupabase({
        events: ok([
          { event_type: 'check_in', user_id: 'u1', beacon_id: 'b1', occurred_at: iso(0) },
          { event_type: 'check_out', user_id: 'u2', beacon_id: 'b1', occurred_at: iso(10) },
          { event_type: 'check_out', user_id: 'u1', beacon_id: 'b-other', occurred_at: iso(10) },
        ]),
      });

      const res = await callRoute();

      const body = await res.json();
      expect(body.dwell.sample_size).toBe(0);
    });

    /**
     * KNOWN BUG — `it.failing` passes while the defect exists and starts failing
     * once it is fixed.
     *
     * The query orders by `occurred_at` descending, so a check-out is always seen
     * before its own check-in and `checkedInAt` is still empty when the pairing
     * runs. Dwell is therefore always empty against real data; the passing test
     * above only works because its fixture is in ascending order.
     *
     * Fix: buffer check-ins/check-outs and pair them after the loop, or read this
     * query in ascending order.
     */
    it.failing('computes dwell from rows in the descending order the query requests', async () => {
      setupSupabase({
        events: ok([
          { event_type: 'check_out', user_id: 'u1', beacon_id: 'b1', occurred_at: iso(30) },
          { event_type: 'check_in', user_id: 'u1', beacon_id: 'b1', occurred_at: iso(0) },
        ]),
      });

      const res = await callRoute();

      const body = await res.json();
      expect(body.dwell).toEqual({ sample_size: 1, p50_minutes: 30, p90_minutes: 30 });
    });
  });

  // 4. PERFORMANCE LIMITS
  describe('Performance Limits', () => {
    it('aggregates the full 5,000-row page in < 50ms', async () => {
      const rows = Array.from({ length: 5000 }, (_, i) => ({
        event_type: i % 2 === 0 ? 'event_view' : 'check_in',
        user_id: `u${i % 500}`,
        beacon_id: `b${i % 10}`,
        occurred_at: iso(i),
        minutes_after_start: i % 90,
      }));

      setupSupabase({ events: ok(rows) });

      const startTime = performance.now();
      const res = await callRoute();
      const durationMs = performance.now() - startTime;

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.funnel.impressions).toBe(2500);
      expect(body.funnel.check_ins).toBe(2500);
      expect(durationMs).toBeLessThan(50);
    });
  });
});
