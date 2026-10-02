/** @jest-environment node */

import { GET as nearbyGet } from '@/app/api/places/nearby/route';
import { GET as detailGet } from '@/app/api/places/[placeId]/route';
import { GET as myPlacesGet } from '@/app/api/me/places/route';
import { resetFeatureFlagCache } from '@/lib/server/featureFlags';
import { deepStrings, type FakeDb } from '../../../helpers/fakeSupabase';
import { CAFE, ctx, IDS, jsonRequest, placesWorld } from '../../../helpers/placesWorld';

const mockState: { db: FakeDb | null; userId: string } = { db: null, userId: IDS.viewer };
const mockEmit = jest.fn();

jest.mock('@/lib/server/supabaseRouteAuth', () => ({
  getSupabaseFromRouteRequest: async () => ({ user: { id: mockState.userId }, supabase: {}, authError: null }),
}));
jest.mock('@/lib/server/admin/supabaseAdmin', () => ({ createAdminSupabaseClient: () => mockState.db!.client }));
jest.mock('@/lib/server/rateLimit', () => ({ isRateLimited: async () => false }));
jest.mock('@/lib/server/telemetry/productEvents', () => ({ emitProductEvent: (...args: unknown[]) => mockEmit(...args) }));

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
const minutesAhead = (m: number) => new Date(Date.now() + m * 60_000).toISOString();

function activeCheckIn(userId: string, share: boolean, placeId: string = IDS.cafe) {
  return {
    id: `ci-${userId}-${placeId}`,
    place_id: placeId,
    user_id: userId,
    checked_at: minutesAgo(15),
    expires_at: minutesAhead(120),
    checked_out_at: null,
    proof: 'gps',
    proof_weight: 0.8,
    share_with_connections: share,
  };
}

/** Everyone is at the café, sharing; the friend, ghost, blocked and stranger have also been here before. */
function busyWorld() {
  return placesWorld({
    extra: {
      place_check_ins: [
        activeCheckIn(IDS.friend, true),
        activeCheckIn(IDS.ghost, true),
        activeCheckIn(IDS.blocked, true),
        activeCheckIn(IDS.stranger, true),
        { ...activeCheckIn(IDS.viewer, false), id: 'viewer-old', checked_at: minutesAgo(60 * 24 * 3), expires_at: minutesAgo(60 * 24 * 3 - 180), checked_out_at: minutesAgo(60 * 24 * 3 - 60) },
      ],
      place_pulses: [
        { id: 'pu1', place_id: IDS.cafe, user_id: IDS.stranger, energy: 3, proof_weight: 0.8, created_at: minutesAgo(4), talkable: 1, category_question: 'seats', category_answer: 1 },
        // A manager's own Pulse never counts.
        { id: 'pu2', place_id: IDS.cafe, user_id: IDS.manager, energy: 1, proof_weight: 1, created_at: minutesAgo(1) },
      ],
      connection_encounters: [
        { id: 'e1', connection_id: IDS.connFriend, place_id: IDS.cafe, reporting_user_id: IDS.viewer, encountered_at: minutesAgo(60 * 24 * 10), gps_lat: 1, gps_lon: 2 },
        { id: 'e2', connection_id: IDS.connBlocked, place_id: IDS.cafe, reporting_user_id: IDS.viewer, encountered_at: minutesAgo(60 * 24 * 5) },
      ],
      map_beacons: [
        {
          id: 'ev-1',
          venue_id: IDS.cafe,
          creator_id: IDS.manager,
          beacon_type: 'event',
          metadata: { title: 'Open mic' },
          starts_at: minutesAgo(30),
          ends_at: minutesAhead(90),
          expires_at: minutesAhead(90),
          visibility_audience: 'everyone',
          event_visibility: 'public',
          cover_theme_id: null,
          cleared_at: null,
        },
        {
          id: 'ev-private',
          venue_id: IDS.cafe,
          creator_id: IDS.stranger,
          beacon_type: 'event',
          metadata: { title: 'Connections only' },
          starts_at: minutesAhead(60),
          ends_at: minutesAhead(120),
          expires_at: minutesAhead(120),
          visibility_audience: 'connections',
          event_visibility: 'public',
          cover_theme_id: null,
          cleared_at: null,
        },
      ],
    },
  });
}

beforeEach(() => {
  resetFeatureFlagCache();
  mockEmit.mockReset().mockResolvedValue(true);
  mockState.userId = IDS.viewer;
  mockState.db = busyWorld();
});

describe('GET /api/places/nearby', () => {
  const call = (query: string) => nearbyGet(jsonRequest(`/api/places/nearby${query}`, 'GET'));

  it('returns 404 with the flag off', async () => {
    mockState.db = placesWorld({ flagOn: false });
    expect((await call(`?lat=${CAFE.lat}&lon=${CAFE.lng}`)).status).toBe(404);
  });

  it('rejects invalid coordinates', async () => {
    const res = await call('?lat=abc&lon=1');
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('invalid_coordinates');
  });

  it('returns listed Places nearest first with the PlaceSummary shape', async () => {
    const res = await call(`?lat=${CAFE.lat}&lng=${CAFE.lng}&radius_meters=5000`);
    expect(res.status).toBe(200);
    const { places } = await res.json();
    expect(places.map((p: { id: string }) => p.id)).toEqual([IDS.cafe, IDS.bar]);
    const cafe = places[0];
    expect(Object.keys(cafe).sort()).toEqual(
      [
        'address_line', 'category', 'city', 'distance_meters', 'events_today_count', 'here_now_count', 'hub_id', 'id',
        'latitude', 'longitude', 'name', 'next_event', 'open_now', 'photo_url', 'pulse', 'radius_meters', 'slug', 'viewer',
      ].sort(),
    );
    expect(cafe).toMatchObject({
      slug: 'cafe-allegro-seattle',
      // friend + stranger + blocked count; the ghost does not.
      here_now_count: 3,
      // The connections-only event by a stranger is hidden from this viewer.
      events_today_count: 1,
      next_event: { beacon_id: 'ev-1', title: 'Open mic', is_live: true },
      hub_id: `place-${IDS.cafe}`,
      open_now: null,
      viewer: { checked_in: false, has_history: true, connections_been_here_count: 1 },
    });
    expect(cafe.pulse).toMatchObject({ state: 'live', label: 'lively', report_count: 1 });
  });

  it('applies filters after enrichment', async () => {
    const res = await call(`?lat=${CAFE.lat}&lon=${CAFE.lng}&pulse_now=1`);
    expect((await res.json()).places.map((p: { id: string }) => p.id)).toEqual([IDS.cafe]);
  });
});

describe('GET /api/places/[placeId]', () => {
  const call = (placeId: string, query = '') => detailGet(jsonRequest(`/api/places/${placeId}${query}`, 'GET'), ctx({ placeId }));

  it('returns 404 for an unlisted Place and with the flag off', async () => {
    expect((await call(IDS.unlisted)).status).toBe(404);
    mockState.db = placesWorld({ flagOn: false });
    resetFeatureFlagCache();
    expect((await call(IDS.cafe)).status).toBe(404);
  });

  it('resolves a slug and returns the detail shape', async () => {
    const res = await call('cafe-allegro-seattle', '?source=map');
    expect(res.status).toBe(200);
    const { place } = await res.json();
    expect(place).toMatchObject({
      id: IDS.cafe,
      directions: {
        apple_maps_url: expect.stringContaining('daddr=47.6588,-122.3131'),
        google_maps_url: 'https://www.google.com/maps/dir/?api=1&destination=47.6588,-122.3131',
      },
      clicks_been_here: { count: 1, names: ['Maya'] },
      // Own history counts every encounter on the viewer's connections (no names).
      own_history: { check_in_count: 1, encounter_count: 2 },
      check_in: null,
      hub: { id: `place-${IDS.cafe}`, name: 'Café Allegro', joined: false },
      is_manager: false,
    });
    expect(place.pulse_eligibility).toMatchObject({ can_pulse: false, reason: 'not_present' });
    expect(place.pulse_eligibility.questions.map((q: { key: string }) => q.key)).toEqual(['energy', 'category', 'talkable']);
    expect(place.pulse_eligibility.leaving_questions.map((q: { key: string }) => q.key)).toEqual(['would_return']);
    expect(mockEmit).toHaveBeenCalledWith(expect.anything(), IDS.viewer, 'place_viewed', { source: 'map' });
  });

  it('names only allowed people: no ghosts, blocked users or strangers anywhere', async () => {
    const res = await call(IDS.cafe);
    const { place } = await res.json();
    const strings = deepStrings(place);
    for (const hidden of [IDS.ghost, IDS.blocked, IDS.stranger, IDS.manager, 'Ghosty', 'Blocky', 'Stranger']) {
      expect(strings).not.toContain(hidden);
    }
    // The friend appears only in the three allowed fields.
    expect(place.here_now_connections).toEqual([{ user_id: IDS.friend, name: 'Maya', avatar_url: null }]);
    expect(place.you_met_here).toEqual({
      total: 1,
      people: [{ user_id: IDS.friend, name: 'Maya', avatar_url: null, last_met_at: expect.any(String) }],
    });
    const withoutAllowed = { ...place, here_now_connections: [], you_met_here: null, clicks_been_here: null };
    expect(deepStrings(withoutAllowed)).not.toContain(IDS.friend);
    expect(deepStrings(withoutAllowed)).not.toContain('Maya');
    // Connection-only events stay hidden from a stranger to their creator.
    expect(place.upcoming_events.map((e: { beacon_id: string }) => e.beacon_id)).toEqual(['ev-1']);
  });

  it('hides here-now names when the check-in is not shared', async () => {
    mockState.db!.rows('place_check_ins').find((r) => r.user_id === IDS.friend)!.share_with_connections = false;
    const { place } = await (await call(IDS.cafe)).json();
    expect(place.here_now_connections).toEqual([]);
    expect(place.here_now_count).toBe(3);
  });

  it('tells a manager they manage the Place and cannot Pulse', async () => {
    mockState.userId = IDS.manager;
    const { place } = await (await call(IDS.cafe)).json();
    expect(place.is_manager).toBe(true);
    expect(place.pulse_eligibility).toMatchObject({ can_pulse: false, reason: 'manager' });
  });

  it('reports a checked-in viewer as able to Pulse', async () => {
    mockState.db!.rows('place_check_ins').push(activeCheckIn(IDS.viewer, false));
    const { place } = await (await call(IDS.cafe)).json();
    expect(place.check_in).toMatchObject({ active: true, proof: 'gps', share_with_connections: false });
    expect(place.pulse_eligibility).toMatchObject({ can_pulse: true, reason: null });
    expect(place.viewer.checked_in).toBe(true);
  });
});

describe('GET /api/me/places', () => {
  it("returns the viewer's own Place history, most recent first", async () => {
    const res = await myPlacesGet(jsonRequest('/api/me/places', 'GET'));
    expect(res.status).toBe(200);
    const { places } = await res.json();
    expect(places).toHaveLength(1);
    expect(places[0]).toMatchObject({ place: { id: IDS.cafe }, check_in_count: 1, encounter_count: 2 });
  });
});
