/**
 * @jest-environment node
 */

import { NextRequest } from 'next/server';
import {
  GET as venueBeaconsGet,
  POST as venueBeaconsPost,
} from '@/app/api/insights/[venueId]/beacons/route';
import {
  expectFilter,
  expectRpcCalledWith,
  filterCalls,
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

const MOCK_USER_ID = 'user-mgr-6060';
const MOCK_VENUE_ID = 'venue-5050';
const VALID_URI = 'spotify:playlist:37i9dQZF1DXcBWIGoYBM5M';
const VENUE_LAT = 37.77;
const VENUE_LNG = -122.41;

const ok = (data: unknown): QueryResult => ({ data, error: null });

const VERIFIED_VENUE = ok({
  id: MOCK_VENUE_ID,
  latitude: VENUE_LAT,
  longitude: VENUE_LNG,
  is_verified: true,
});

const INSERTED_BEACON = ok({
  id: 'beacon-1',
  creator_id: MOCK_USER_ID,
  venue_id: MOCK_VENUE_ID,
  beacon_type: 'soundtrack',
  metadata: { is_official: true, spotify_playlist_uri: VALID_URI, label: 'Official Soundtrack' },
  created_at: '2026-08-12T10:00:00.000Z',
  expires_at: '2026-08-19T10:00:00.000Z',
  location: `POINT(${VENUE_LNG} ${VENUE_LAT})`,
});

type Overrides = {
  venueManagers?: QueryResult;
  venues?: QueryResult;
  mapBeacons?: QueryResult;
  rpc?: SupabaseMockOptions['rpc'];
};

function setupSupabase(overrides: Overrides = {}) {
  const mock = makeSupabaseMock({
    tables: {
      venue_managers: overrides.venueManagers ?? ok({ id: 'vm-1' }),
      venues: overrides.venues ?? VERIFIED_VENUE,
      map_beacons: overrides.mapBeacons ?? INSERTED_BEACON,
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

function callGet() {
  return venueBeaconsGet(
    new NextRequest(`http://localhost/api/insights/${MOCK_VENUE_ID}/beacons`),
    { params: Promise.resolve({ venueId: MOCK_VENUE_ID }) },
  );
}

function callPost(body: unknown = { spotify_playlist_uri: VALID_URI }) {
  const req = new NextRequest(`http://localhost/api/insights/${MOCK_VENUE_ID}/beacons`, {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
  return venueBeaconsPost(req, { params: Promise.resolve({ venueId: MOCK_VENUE_ID }) });
}

describe('GET /api/insights/[venueId]/beacons contract', () => {
  beforeEach(() => {
    mockGetSupabaseFromRouteRequest.mockReset();
    mockUserMayAccessBusinessInsights.mockReset();
  });

  describe('Security Controls & Auth', () => {
    it('returns 401 Unauthorized when unauthenticated', async () => {
      mockGetSupabaseFromRouteRequest.mockResolvedValue({
        supabase: {},
        user: null,
        authError: new Error('Missing session'),
      });

      const res = await callGet();

      expect(res.status).toBe(401);
      expect((await res.json()).error).toBe('Unauthorized');
    });

    it('returns 403 when the user is not eligible for business insights', async () => {
      const mock = setupSupabase();
      mockUserMayAccessBusinessInsights.mockResolvedValue(false);

      const res = await callGet();

      expect(res.status).toBe(403);
      expect(mock.from).not.toHaveBeenCalled();
    });

    it('returns 403 when the user does not manage the venue', async () => {
      const mock = setupSupabase({ venueManagers: ok(null) });

      const res = await callGet();

      expect(res.status).toBe(403);
      expect((await res.json()).error).toBe('Not a manager for this venue');
      expect(mock.rpc).not.toHaveBeenCalled();
    });

    it('returns 500 when the manager lookup itself fails', async () => {
      setupSupabase({ venueManagers: { data: null, error: { message: 'PostgREST down' } } });

      const res = await callGet();

      expect(res.status).toBe(500);
      expect((await res.json()).error).toBe('Failed to verify access');
    });

    it('scopes the manager lookup and the listing RPC to venue and user', async () => {
      const mock = setupSupabase({ rpc: () => ok([]) });

      await callGet();

      const managers = mock.builder('venue_managers');
      expectFilter(managers, 'venue_id', MOCK_VENUE_ID);
      expectFilter(managers, 'user_id', MOCK_USER_ID);
      expectRpcCalledWith(mock.rpc, 'insights_venue_map_beacons_list', {
        venue_id_param: MOCK_VENUE_ID,
      });
    });
  });

  describe('Functional Correctness', () => {
    it('returns parsed beacons and drops rows that fail validation', async () => {
      setupSupabase({
        rpc: () =>
          ok([
            {
              id: 'beacon-1',
              creator_id: 'creator-1',
              venue_id: MOCK_VENUE_ID,
              beacon_type: 'soundtrack',
              lat: VENUE_LAT,
              lng: VENUE_LNG,
              metadata: { label: 'Official Soundtrack' },
              created_at: '2026-08-12T10:00:00.000Z',
              expires_at: '2026-08-19T10:00:00.000Z',
            },
            // Unknown beacon type.
            {
              id: 'beacon-2',
              creator_id: 'creator-1',
              beacon_type: 'not_a_real_type',
              lat: VENUE_LAT,
              lng: VENUE_LNG,
              created_at: '2026-08-12T10:00:00.000Z',
              expires_at: '2026-08-19T10:00:00.000Z',
            },
            // Missing coordinates.
            {
              id: 'beacon-3',
              creator_id: 'creator-1',
              beacon_type: 'swag',
              created_at: '2026-08-12T10:00:00.000Z',
              expires_at: '2026-08-19T10:00:00.000Z',
            },
            null,
          ]),
      });

      const res = await callGet();

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.beacons).toHaveLength(1);
      expect(body.beacons[0]).toEqual(
        expect.objectContaining({
          id: 'beacon-1',
          beacon_type: 'soundtrack',
          lat: VENUE_LAT,
          lng: VENUE_LNG,
          visibility_audience: 'everyone',
          show_creator_name: false,
        }),
      );
    });

    it('returns an empty list when the RPC returns a non-array', async () => {
      setupSupabase({ rpc: () => ok({ unexpected: true }) });

      const res = await callGet();

      expect(res.status).toBe(200);
      expect((await res.json()).beacons).toEqual([]);
    });

    it('returns 500 when the listing RPC fails', async () => {
      setupSupabase({ rpc: () => ({ data: null, error: { message: 'rpc exploded' } }) });

      const res = await callGet();

      expect(res.status).toBe(500);
      expect((await res.json()).error).toBe('rpc exploded');
    });
  });
});

describe('POST /api/insights/[venueId]/beacons contract', () => {
  beforeEach(() => {
    mockGetSupabaseFromRouteRequest.mockReset();
    mockUserMayAccessBusinessInsights.mockReset();
  });

  describe('Security Controls & Auth', () => {
    it('returns 401 Unauthorized when unauthenticated', async () => {
      mockGetSupabaseFromRouteRequest.mockResolvedValue({
        supabase: {},
        user: null,
        authError: new Error('Missing session'),
      });

      const res = await callPost();

      expect(res.status).toBe(401);
    });

    it('returns 403 when the user is not eligible for business insights', async () => {
      const mock = setupSupabase();
      mockUserMayAccessBusinessInsights.mockResolvedValue(false);

      const res = await callPost();

      expect(res.status).toBe(403);
      expect(mock.from).not.toHaveBeenCalled();
    });

    it('returns 403 without writing when the user does not manage the venue', async () => {
      const mock = setupSupabase({ venueManagers: ok(null) });

      const res = await callPost();

      expect(res.status).toBe(403);
      expect((await res.json()).error).toBe('Not a manager for this venue');
      expect(mock.from).not.toHaveBeenCalledWith('map_beacons');
    });

    it('returns 403 without writing when the manager lookup fails', async () => {
      const mock = setupSupabase({
        venueManagers: { data: null, error: { message: 'PostgREST down' } },
      });

      const res = await callPost();

      expect(res.status).toBe(403);
      expect(mock.from).not.toHaveBeenCalledWith('map_beacons');
    });

    it('scopes the manager lookup to venue and user', async () => {
      const mock = setupSupabase();

      await callPost();

      const managers = mock.builder('venue_managers');
      expectFilter(managers, 'venue_id', MOCK_VENUE_ID);
      expectFilter(managers, 'user_id', MOCK_USER_ID);
    });

    it('returns 403 when the venue is not verified', async () => {
      const mock = setupSupabase({
        venues: ok({ id: MOCK_VENUE_ID, latitude: VENUE_LAT, longitude: VENUE_LNG, is_verified: false }),
      });

      const res = await callPost();

      expect(res.status).toBe(403);
      expect((await res.json()).error).toContain('must be verified');
      expect(mock.from).not.toHaveBeenCalledWith('map_beacons');
    });

    it('returns 404 when the venue row is missing', async () => {
      setupSupabase({ venues: ok(null) });

      const res = await callPost();

      expect(res.status).toBe(404);
      expect((await res.json()).error).toBe('Venue not found');
    });
  });

  describe('Input Validation', () => {
    it('returns 400 when the venue has no coordinates to place the beacon', async () => {
      setupSupabase({
        venues: ok({ id: MOCK_VENUE_ID, latitude: null, longitude: null, is_verified: true }),
      });

      const res = await callPost();

      expect(res.status).toBe(400);
      expect((await res.json()).error).toContain('latitude and longitude are required');
    });

    it('returns 400 for a malformed JSON body', async () => {
      setupSupabase();

      const res = await callPost('{ not json');

      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe('Invalid JSON body');
    });

    it.each([
      ['a missing uri', {}],
      ['a non-string uri', { spotify_playlist_uri: 12345 }],
      ['a non-spotify uri', { spotify_playlist_uri: 'https://example.com/playlist' }],
      ['a spotify album uri', { spotify_playlist_uri: 'spotify:album:123' }],
      ['the bare prefix', { spotify_playlist_uri: 'spotify:playlist:' }],
      ['an over-long uri', { spotify_playlist_uri: `spotify:playlist:${'a'.repeat(600)}` }],
    ])('returns 400 for %s', async (_label, body) => {
      const mock = setupSupabase();

      const res = await callPost(body);

      expect(res.status).toBe(400);
      expect((await res.json()).error).toContain('spotify:playlist:');
      expect(mock.from).not.toHaveBeenCalledWith('map_beacons');
    });

    it('trims surrounding whitespace from an otherwise valid uri', async () => {
      const mock = setupSupabase();

      const res = await callPost({ spotify_playlist_uri: `  ${VALID_URI}  ` });

      expect(res.status).toBe(200);
      const [insertPayload] = filterCalls(mock.builder('map_beacons'), 'insert')[0] as [
        Record<string, unknown>,
      ];
      expect((insertPayload.metadata as Record<string, unknown>).spotify_playlist_uri).toBe(VALID_URI);
    });
  });

  describe('Functional Correctness', () => {
    it('writes an official soundtrack beacon owned by the caller at the venue location', async () => {
      const mock = setupSupabase();
      const before = Date.now();

      const res = await callPost();

      expect(res.status).toBe(200);
      const [insertPayload] = filterCalls(mock.builder('map_beacons'), 'insert')[0] as [
        Record<string, unknown>,
      ];

      expect(insertPayload).toEqual(
        expect.objectContaining({
          creator_id: MOCK_USER_ID,
          venue_id: MOCK_VENUE_ID,
          beacon_type: 'soundtrack',
          location: `POINT(${VENUE_LNG} ${VENUE_LAT})`,
          metadata: {
            is_official: true,
            spotify_playlist_uri: VALID_URI,
            label: 'Official Soundtrack',
          },
        }),
      );
      // Beacons expire after seven days.
      const expiresAt = Date.parse(insertPayload.expires_at as string);
      expect(expiresAt).toBeGreaterThanOrEqual(before + 7 * 86400000);
      expect(expiresAt).toBeLessThanOrEqual(Date.now() + 7 * 86400000);
    });

    it('returns the inserted beacon with coordinates parsed out of the PostGIS point', async () => {
      setupSupabase();

      const res = await callPost();

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.beacon).toEqual(
        expect.objectContaining({
          id: 'beacon-1',
          beacon_type: 'soundtrack',
          venue_id: MOCK_VENUE_ID,
          lat: VENUE_LAT,
          lng: VENUE_LNG,
        }),
      );
    });

    it('falls back to the venue coordinates when the row has no readable point', async () => {
      setupSupabase({
        mapBeacons: ok({ ...(INSERTED_BEACON.data as object), location: null }),
      });

      const res = await callPost();

      const body = await res.json();
      expect(body.beacon.lat).toBe(VENUE_LAT);
      expect(body.beacon.lng).toBe(VENUE_LNG);
    });

    it('returns 400 with the database message when the insert is rejected', async () => {
      setupSupabase({
        mapBeacons: { data: null, error: { message: 'new row violates row-level security policy' } },
      });

      const res = await callPost();

      expect(res.status).toBe(400);
      expect((await res.json()).error).toContain('row-level security');
    });

    it('returns 500 when the insert succeeds but returns no row', async () => {
      setupSupabase({ mapBeacons: ok(null) });

      const res = await callPost();

      expect(res.status).toBe(500);
      expect((await res.json()).error).toBe('Insert failed');
    });

    it('returns 500 when the route throws unexpectedly', async () => {
      mockGetSupabaseFromRouteRequest.mockRejectedValue(new Error('client boom'));

      const res = await callPost();

      expect(res.status).toBe(500);
      expect((await res.json()).error).toBe('Internal Server Error');
    });
  });
});
