/** @jest-environment node */

import { PATCH } from '@/app/api/places/[placeId]/route';
import { GET as minePlaces } from '@/app/api/places/mine/route';
import { GET as statsGet } from '@/app/api/places/[placeId]/stats/route';
import { GET as anchorsGet } from '@/app/api/places/[placeId]/anchors/route';
import { POST as photoPost } from '@/app/api/places/[placeId]/photo/route';
import { resetFeatureFlagCache } from '@/lib/server/featureFlags';
import { deepKeys, deepStrings, type FakeDb } from '../../../helpers/fakeSupabase';
import { ctx, IDS, jsonRequest, placesWorld } from '../../../helpers/placesWorld';

const mockState: { db: FakeDb | null; userId: string; insights: boolean } = { db: null, userId: IDS.manager, insights: false };

jest.mock('@/lib/server/supabaseRouteAuth', () => ({
  getSupabaseFromRouteRequest: async () => ({ user: { id: mockState.userId }, supabase: {}, authError: null }),
}));
jest.mock('@/lib/server/admin/supabaseAdmin', () => ({ createAdminSupabaseClient: () => mockState.db!.client }));
jest.mock('@/lib/server/businessInsightsEligibility', () => ({ userMayAccessBusinessInsights: async () => mockState.insights }));

const params = ctx({ placeId: IDS.cafe });
const FIXED_NOW = new Date('2026-09-30T19:00:00.000Z');
const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
const daysAgoKey = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString().slice(0, 10);

function statsWorld() {
  // The flag is OFF: manager routes must still work (owners prepare before launch).
  return placesWorld({
    flagOn: false,
    extra: {
      place_check_ins: [
        { id: 'c1', place_id: IDS.cafe, user_id: IDS.friend, checked_at: hoursAgo(31 / 60), checked_out_at: hoursAgo(1 / 60), checkout_reason: 'user', count_for_insights: true },
        { id: 'c2', place_id: IDS.cafe, user_id: IDS.viewer, checked_at: hoursAgo(10 / 60), checked_out_at: null, checkout_reason: null, count_for_insights: true },
        // Opted out of business insights: never counted.
        { id: 'c3', place_id: IDS.cafe, user_id: IDS.stranger, checked_at: hoursAgo(10 / 60), checked_out_at: null, checkout_reason: null, count_for_insights: false },
      ],
      place_pulses: [
        { id: 'p1', place_id: IDS.cafe, user_id: IDS.friend, energy: 3, talkable: 1, would_return: null, created_at: hoursAgo(10 / 60), count_for_insights: true },
        { id: 'p2', place_id: IDS.cafe, user_id: IDS.stranger, energy: 4, talkable: 0, would_return: null, created_at: hoursAgo(10 / 60), count_for_insights: false },
      ],
      place_daily_stats: [
        {
          place_id: IDS.cafe,
          day: daysAgoKey(3),
          check_ins: 5,
          unique_visitors: 4,
          repeat_visitors: 1,
          check_ins_by_hour: Array.from({ length: 24 }, (_, h) => (h === 18 ? 5 : 0)),
          dwell_minutes_sum: 120,
          dwell_samples: 2,
          pulses: 2,
          energy_counts: [0, 1, 1, 0],
          talkable_yes: 1,
          talkable_no: 0,
          would_return_yes: 1,
          would_return_no: 0,
          event_check_ins: 2,
          new_connections: 1,
          repeat_connections: 0,
        },
      ],
    },
  });
}

beforeAll(() => {
  jest.useFakeTimers();
  jest.setSystemTime(FIXED_NOW);
});

afterAll(() => {
  jest.useRealTimers();
});

beforeEach(() => {
  resetFeatureFlagCache();
  mockState.userId = IDS.manager;
  mockState.insights = false;
  mockState.db = statsWorld();
});

describe('GET /api/places/[placeId]/stats', () => {
  const call = (query = '') => statsGet(jsonRequest(`/api/places/${IDS.cafe}/stats${query}`, 'GET'), params);

  it('refuses non-managers', async () => {
    mockState.userId = IDS.viewer;
    const res = await call();
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('not_a_manager');
  });

  it('returns aggregates only, counting insights-eligible rows', async () => {
    const res = await call('?range=30d&detail=basic');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.range_days).toBe(30);
    // 5 stored + 2 eligible today (the opted-out check-in is excluded).
    expect(body.totals).toMatchObject({ check_ins: 7, unique_visitors: 2, pulses: 3, new_connections: 1 });
    expect(body.energy_distribution).toEqual([0, 1, 2, 0]);
    expect(body.talkable).toEqual({ yes: 2, no: 0 });
    expect(body.check_ins_by_dow_hour).toHaveLength(7);
    expect(body.check_ins_by_dow_hour.every((row: number[]) => row.length === 24)).toBe(true);
    expect(body.daily).toBeUndefined();
  });

  it('never includes a user id, name or individual timestamp', async () => {
    mockState.insights = true;
    const body = await (await call('?range=90d&detail=full')).json();
    const keys = deepKeys(body);
    expect(keys).not.toContain('user_id');
    expect(keys).not.toContain('name');
    expect(keys).not.toContain('checked_at');
    const strings = deepStrings(body);
    for (const id of Object.values(IDS)) expect(strings).not.toContain(id);
    expect(body).toMatchObject({ range_days: 90, median_dwell_minutes: 30, event_vs_regular: { event_check_ins: 2, regular_check_ins: 5 } });
    expect(body.pulse_by_daypart).toEqual(expect.objectContaining({ morning: expect.any(Array), night: expect.any(Array) }));
  });

  it('requires Click for Business for full detail', async () => {
    const res = await call('?detail=full');
    expect(res.status).toBe(402);
    expect((await res.json()).code).toBe('insights_required');
  });
});

describe('PATCH /api/places/[placeId]', () => {
  const patch = (body: unknown) => PATCH(jsonRequest(`/api/places/${IDS.cafe}`, 'PATCH', body), params);

  it('lets an owner edit the allowed fields', async () => {
    const res = await patch({ description: 'Espresso since 1975', hours: { mon: [['07:00', '15:00']] }, website_url: 'https://allegro.example' });
    expect(res.status).toBe(200);
    const { place } = await res.json();
    expect(place).toMatchObject({ description: 'Espresso since 1975', hours: { mon: [['07:00', '15:00']] }, role: 'owner' });
    expect(mockState.db!.rows('places')[0].description).toBe('Espresso since 1975');
  });

  it('refuses the viewer role', async () => {
    mockState.db!.rows('place_managers')[0].role = 'viewer';
    const res = await patch({ description: 'x' });
    expect(res.status).toBe(403);
  });

  it('refuses non-managers', async () => {
    mockState.userId = IDS.viewer;
    expect((await patch({ description: 'x' })).status).toBe(403);
  });

  it('rejects invalid hours and http links', async () => {
    let res = await patch({ hours: { monday: [['7', '3']] } });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('invalid_hours');
    res = await patch({ website_url: 'http://insecure.example' });
    expect((await res.json()).code).toBe('invalid_website');
  });

  it('refuses admin-only fields', async () => {
    const res = await patch({ name: 'Renamed', radius_meters: 500 });
    expect(res.status).toBe(400);
    expect(mockState.db!.rows('places')[0].name).toBe('Café Allegro');
  });

  it('creates exactly one Place Hub when the hub is turned on', async () => {
    mockState.db!.tables.hub_venues = [];
    mockState.db!.rows('places')[0].hub_enabled = false;
    await patch({ hub_enabled: true });
    await patch({ hub_enabled: false });
    await patch({ hub_enabled: true });
    const hubs = mockState.db!.rows('hub_venues');
    expect(hubs).toHaveLength(1);
    expect(hubs[0]).toMatchObject({ id: `place-${IDS.cafe}`, place_id: IDS.cafe, name: 'Café Allegro', expires_at: null, creator_id: IDS.manager });
    expect(mockState.db!.rows('hub_participants')).toEqual(
      expect.arrayContaining([expect.objectContaining({ hub_id: `place-${IDS.cafe}`, user_id: IDS.manager })]),
    );
    expect(mockState.db!.rows('places')[0].hub_enabled).toBe(true);
  });
});

describe('manager reads', () => {
  it('lists my Places with my role', async () => {
    const { places } = await (await minePlaces(jsonRequest('/api/places/mine', 'GET'))).json();
    expect(places).toEqual([expect.objectContaining({ id: IDS.cafe, role: 'owner', verification_status: 'verified', listed: true })]);
  });

  it('lists active check-in anchors with the QR URL', async () => {
    const { anchors } = await (await anchorsGet(jsonRequest(`/api/places/${IDS.cafe}/anchors`, 'GET'), params)).json();
    expect(anchors).toEqual([
      { id: IDS.anchor, name: 'Counter', check_in_url: expect.stringMatching(new RegExp(`/p/cafe-allegro-seattle\\?t=${IDS.anchorToken}$`)) },
    ]);
  });

  it('uploads a cover photo and removes the previous one', async () => {
    mockState.db!.rows('places')[0].photo_path = `${IDS.cafe}/cover-old.jpg`;
    const res = await photoPost(
      jsonRequest(`/api/places/${IDS.cafe}/photo`, 'POST', { file_b64: Buffer.from('fake-jpeg').toString('base64'), mime_type: 'image/jpeg' }),
      params,
    );
    expect(res.status).toBe(200);
    const path = String(mockState.db!.rows('places')[0].photo_path);
    expect(path).toMatch(new RegExp(`^${IDS.cafe}/cover-\\d+\\.jpg$`));
    expect(mockState.db!.log).toEqual(
      expect.arrayContaining([{ table: 'storage:place-photos', op: 'remove', payload: [`${IDS.cafe}/cover-old.jpg`] }]),
    );
  });

  it('rejects unsupported photo types', async () => {
    const res = await photoPost(
      jsonRequest(`/api/places/${IDS.cafe}/photo`, 'POST', { file_b64: 'AAAA', mime_type: 'image/gif' }),
      params,
    );
    expect(res.status).toBe(400);
  });
});
