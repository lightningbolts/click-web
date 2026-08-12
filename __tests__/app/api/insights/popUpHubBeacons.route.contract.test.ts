/**
 * @jest-environment node
 */

import { NextRequest } from 'next/server';
import { POST as popUpHubPost } from '@/app/api/insights/beacons/route';
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

const MOCK_USER_ID = 'user-mgr-7070';
const MOCK_VENUE_ID = 'venue-6060';

const ok = (data: unknown): QueryResult => ({ data, error: null });

const VALID_BODY = {
  venue_id: MOCK_VENUE_ID,
  perk_description: '2-for-1 espresso martinis for the next hour',
  category_target: 'Drinks',
  duration_minutes: 60,
};

const INSERTED_HUB = ok({
  id: 'hub-1',
  venue_id: MOCK_VENUE_ID,
  perk_description: VALID_BODY.perk_description,
  category_target: 'Drinks',
  duration_minutes: 60,
  starts_at: '2026-08-12T10:00:00.000Z',
  ends_at: '2026-08-12T11:00:00.000Z',
  created_at: '2026-08-12T10:00:00.000Z',
});

function setupSupabase(
  overrides: { venueManagers?: QueryResult; hubs?: QueryResult } = {},
) {
  const mock = makeSupabaseMock({
    tables: {
      venue_managers: overrides.venueManagers ?? ok({ id: 'vm-1' }),
      venue_pop_up_hubs: overrides.hubs ?? INSERTED_HUB,
    },
  });

  mockGetSupabaseFromRouteRequest.mockResolvedValue({
    supabase: mock.supabase,
    user: { id: MOCK_USER_ID },
    authError: null,
  });
  mockUserMayAccessBusinessInsights.mockResolvedValue(true);

  return mock;
}

function callRoute(body: unknown = VALID_BODY) {
  const req = new NextRequest('http://localhost/api/insights/beacons', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
  return popUpHubPost(req);
}

describe('POST /api/insights/beacons contract', () => {
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
      expect((await res.json()).error).toBe('Unauthorized');
    });

    it('returns 403 when the user is not eligible for business insights', async () => {
      const mock = setupSupabase();
      mockUserMayAccessBusinessInsights.mockResolvedValue(false);

      const res = await callRoute();

      expect(res.status).toBe(403);
      expect(mock.from).not.toHaveBeenCalled();
    });

    it('returns 403 without writing when the user does not manage the target venue', async () => {
      const mock = setupSupabase({ venueManagers: ok(null) });

      const res = await callRoute();

      expect(res.status).toBe(403);
      expect((await res.json()).error).toBe('Not a manager for this venue');
      expect(mock.from).not.toHaveBeenCalledWith('venue_pop_up_hubs');
    });

    it('checks membership against the venue named in the body, for the signed-in user', async () => {
      const mock = setupSupabase({ venueManagers: ok(null) });

      await callRoute({ ...VALID_BODY, venue_id: 'someone-elses-venue' });

      const managers = mock.builder('venue_managers');
      expectFilter(managers, 'venue_id', 'someone-elses-venue');
      expectFilter(managers, 'user_id', MOCK_USER_ID);
    });

    it('returns 500 when the manager lookup itself fails', async () => {
      const mock = setupSupabase({
        venueManagers: { data: null, error: { message: 'PostgREST down' } },
      });

      const res = await callRoute();

      expect(res.status).toBe(500);
      expect((await res.json()).error).toBe('Failed to verify access');
      expect(mock.from).not.toHaveBeenCalledWith('venue_pop_up_hubs');
    });
  });

  // 2. INPUT VALIDATION
  describe('Input Validation', () => {
    it('returns 400 for a malformed JSON body', async () => {
      setupSupabase();

      const res = await callRoute('{ not json');

      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe('Invalid JSON body');
    });

    it.each([
      ['a missing venue_id', { ...VALID_BODY, venue_id: undefined }, 'venue_id is required'],
      ['a blank venue_id', { ...VALID_BODY, venue_id: '   ' }, 'venue_id is required'],
      ['a non-string venue_id', { ...VALID_BODY, venue_id: 42 }, 'venue_id is required'],
      ['a missing perk', { ...VALID_BODY, perk_description: undefined }, 'perk_description is required'],
      ['a blank perk', { ...VALID_BODY, perk_description: '  ' }, 'perk_description is required'],
      [
        'an over-long perk',
        { ...VALID_BODY, perk_description: 'x'.repeat(501) },
        'perk_description is required',
      ],
      ['a missing category', { ...VALID_BODY, category_target: undefined }, 'category_target is required'],
      [
        'an over-long category',
        { ...VALID_BODY, category_target: 'x'.repeat(81) },
        'category_target is required',
      ],
      ['a missing duration', { ...VALID_BODY, duration_minutes: undefined }, 'duration_minutes must be'],
      ['a non-numeric duration', { ...VALID_BODY, duration_minutes: '60' }, 'duration_minutes must be'],
      ['a NaN duration', { ...VALID_BODY, duration_minutes: Number.NaN }, 'duration_minutes must be'],
      ['a too-short duration', { ...VALID_BODY, duration_minutes: 14 }, 'duration_minutes must be'],
      ['a too-long duration', { ...VALID_BODY, duration_minutes: 10081 }, 'duration_minutes must be'],
    ])('returns 400 for %s', async (_label, body, message) => {
      const mock = setupSupabase();

      const res = await callRoute(body);

      expect(res.status).toBe(400);
      expect((await res.json()).error).toContain(message);
      // Validation runs before any database access.
      expect(mock.from).not.toHaveBeenCalled();
    });

    it.each([15, 10080])('accepts the boundary duration of %i minutes', async (duration) => {
      setupSupabase();

      const res = await callRoute({ ...VALID_BODY, duration_minutes: duration });

      expect(res.status).toBe(200);
    });
  });

  // 3. FUNCTIONAL CORRECTNESS
  describe('Functional Correctness', () => {
    it('inserts a hub owned by the caller with a window derived from the duration', async () => {
      const mock = setupSupabase();

      const res = await callRoute();

      expect(res.status).toBe(200);
      const [payload] = filterCalls(mock.builder('venue_pop_up_hubs'), 'insert')[0] as [
        Record<string, string | number>,
      ];

      expect(payload).toEqual(
        expect.objectContaining({
          venue_id: MOCK_VENUE_ID,
          created_by: MOCK_USER_ID,
          perk_description: VALID_BODY.perk_description,
          category_target: 'Drinks',
          duration_minutes: 60,
        }),
      );
      const startsAt = Date.parse(payload.starts_at as string);
      const endsAt = Date.parse(payload.ends_at as string);
      expect(endsAt - startsAt).toBe(60 * 60_000);
    });

    it('trims whitespace and rounds fractional durations before writing', async () => {
      const mock = setupSupabase();

      const res = await callRoute({
        venue_id: `  ${MOCK_VENUE_ID}  `,
        perk_description: '  Free cold brew  ',
        category_target: '  Coffee  ',
        duration_minutes: 45.6,
      });

      expect(res.status).toBe(200);
      const [payload] = filterCalls(mock.builder('venue_pop_up_hubs'), 'insert')[0] as [
        Record<string, string | number>,
      ];
      expect(payload).toEqual(
        expect.objectContaining({
          venue_id: MOCK_VENUE_ID,
          perk_description: 'Free cold brew',
          category_target: 'Coffee',
          duration_minutes: 46,
        }),
      );
    });

    it('returns the created beacon row', async () => {
      setupSupabase();

      const res = await callRoute();

      const body = await res.json();
      expect(body.beacon).toEqual(
        expect.objectContaining({ id: 'hub-1', venue_id: MOCK_VENUE_ID, duration_minutes: 60 }),
      );
    });

    it('returns 400 with the database message when the insert is rejected', async () => {
      setupSupabase({
        hubs: { data: null, error: { message: 'new row violates row-level security policy' } },
      });

      const res = await callRoute();

      expect(res.status).toBe(400);
      expect((await res.json()).error).toContain('row-level security');
    });

    it('returns 500 when the route throws unexpectedly', async () => {
      mockGetSupabaseFromRouteRequest.mockRejectedValue(new Error('client boom'));

      const res = await callRoute();

      expect(res.status).toBe(500);
      expect((await res.json()).error).toBe('Internal Server Error');
    });
  });
});
