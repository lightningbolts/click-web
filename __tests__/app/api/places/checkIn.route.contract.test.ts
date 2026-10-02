/** @jest-environment node */

import { DELETE, GET, POST } from '@/app/api/places/[placeId]/check-in/route';
import { resetFeatureFlagCache } from '@/lib/server/featureFlags';
import type { FakeDb } from '../../../helpers/fakeSupabase';
import { CAFE, ctx, IDS, jsonRequest, metersNorth, placesWorld } from '../../../helpers/placesWorld';

const mockState: { db: FakeDb | null; userId: string | null } = { db: null, userId: IDS.viewer };
const mockEmit = jest.fn();

jest.mock('@/lib/server/supabaseRouteAuth', () => ({
  getSupabaseFromRouteRequest: async () =>
    mockState.userId
      ? { user: { id: mockState.userId }, supabase: {}, authError: null }
      : { user: null, supabase: {}, authError: new Error('no session') },
}));
jest.mock('@/lib/server/admin/supabaseAdmin', () => ({ createAdminSupabaseClient: () => mockState.db!.client }));
jest.mock('@/lib/server/rateLimit', () => ({ isRateLimited: async () => false }));
jest.mock('@/lib/server/telemetry/productEvents', () => ({ emitProductEvent: (...args: unknown[]) => mockEmit(...args) }));

const params = ctx({ placeId: IDS.cafe });
const post = (body: unknown, placeId: string = IDS.cafe) =>
  POST(jsonRequest(`/api/places/${placeId}/check-in`, 'POST', body), ctx({ placeId }));
const inside = { latitude: metersNorth(20), longitude: CAFE.lng, accuracy_meters: 15 };

function checkIns(db: FakeDb) {
  return db.rows('place_check_ins');
}

beforeEach(() => {
  resetFeatureFlagCache();
  mockEmit.mockReset().mockResolvedValue(true);
  mockState.userId = IDS.viewer;
  mockState.db = placesWorld();
});

describe('POST /api/places/[placeId]/check-in', () => {
  it('returns 404 when the flag is off for the caller', async () => {
    mockState.db = placesWorld({ flagOn: false });
    const res = await post(inside);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Not found' });
  });

  it('returns 401 without a session', async () => {
    mockState.userId = null;
    expect((await post(inside)).status).toBe(401);
  });

  it('returns 404 place_not_found for an unlisted Place', async () => {
    const res = await post(inside, IDS.unlisted);
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe('place_not_found');
  });

  it('accepts GPS inside the radius and stores buckets, never coordinates', async () => {
    const res = await post({ ...inside, share_with_connections: true, platform: 'ios', app_version: '1.9.0' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ checked_in: true, refreshed: false, proof: 'gps', share_with_connections: true, hub_id: `place-${IDS.cafe}`, here_now_count: 1 });

    const [row] = checkIns(mockState.db!);
    expect(row).toMatchObject({
      place_id: IDS.cafe,
      user_id: IDS.viewer,
      proof: 'gps',
      proof_weight: 0.8,
      distance_bucket: '0_25',
      accuracy_bucket: '0_20',
      count_for_insights: true,
      platform: 'ios',
    });
    expect(Object.keys(row)).not.toEqual(expect.arrayContaining(['latitude']));
    expect(JSON.stringify(row)).not.toContain(String(inside.latitude));
    // Joins the Place Hub right away.
    expect(mockState.db!.rows('hub_participants')).toEqual([{ id: expect.any(String), hub_id: `place-${IDS.cafe}`, user_id: IDS.viewer }]);
    expect(mockEmit).toHaveBeenCalledWith(expect.anything(), IDS.viewer, 'place_check_in', { proof: 'gps' });
  });

  it('rejects out of bounds with the distance and stores nothing', async () => {
    const res = await post({ latitude: metersNorth(300), longitude: CAFE.lng, accuracy_meters: 10 });
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ code: 'out_of_bounds', distance_meters: 300 });
    expect(checkIns(mockState.db!)).toHaveLength(0);
    expect(mockEmit).toHaveBeenCalledWith(expect.anything(), IDS.viewer, 'place_check_in_rejected', { reason: 'out_of_bounds' });
  });

  it('rejects low accuracy', async () => {
    const res = await post({ ...inside, accuracy_meters: 150 });
    expect(res.status).toBe(422);
    expect((await res.json()).code).toBe('low_accuracy');
    expect(checkIns(mockState.db!)).toHaveLength(0);
  });

  it('rejects a missing location', async () => {
    const res = await post({});
    expect(res.status).toBe(422);
    expect((await res.json()).code).toBe('no_location');
  });

  it('accepts a QR anchor token with nearby GPS at full weight', async () => {
    const res = await post({ anchor_token: IDS.anchorToken, ...inside });
    expect(res.status).toBe(200);
    expect((await res.json()).proof).toBe('qr');
    expect(checkIns(mockState.db!)[0]).toMatchObject({ proof: 'qr', proof_weight: 1, anchor_id: IDS.anchor });
  });

  it('accepts a QR anchor token without location at reduced weight', async () => {
    const res = await post({ anchor_token: IDS.anchorToken });
    expect(res.status).toBe(200);
    expect(checkIns(mockState.db!)[0]).toMatchObject({ proof: 'qr', proof_weight: 0.6, distance_bucket: null });
  });

  it('rejects an unknown or inactive QR token', async () => {
    let res = await post({ anchor_token: 'not-a-real-token' });
    expect(res.status).toBe(422);
    expect((await res.json()).code).toBe('invalid_anchor');

    mockState.db!.rows('nfc_anchors')[0].active = false;
    res = await post({ anchor_token: IDS.anchorToken });
    expect((await res.json()).code).toBe('invalid_anchor');
    expect(checkIns(mockState.db!)).toHaveLength(0);
  });

  it('rejects a photographed QR code used far away', async () => {
    const res = await post({ anchor_token: IDS.anchorToken, latitude: metersNorth(2000), longitude: CAFE.lng, accuracy_meters: 10 });
    expect(res.status).toBe(422);
    expect((await res.json()).code).toBe('out_of_bounds');
    expect(checkIns(mockState.db!)).toHaveLength(0);
  });

  it('refreshes an active check-in instead of opening a second one', async () => {
    await post(inside);
    const first = { ...checkIns(mockState.db!)[0] };
    first.checked_at = '2026-01-01T00:00:00.000Z';
    checkIns(mockState.db!)[0].checked_at = first.checked_at;

    const res = await post({ anchor_token: IDS.anchorToken, ...inside });
    expect((await res.json()).refreshed).toBe(true);
    const rows = checkIns(mockState.db!);
    expect(rows).toHaveLength(1);
    // Stronger proof upgrades the row.
    expect(rows[0]).toMatchObject({ proof: 'qr', proof_weight: 1 });
  });

  it('supersedes an active check-in at another Place', async () => {
    await post({ latitude: 47.6688, longitude: CAFE.lng, accuracy_meters: 10 }, IDS.bar);
    expect(checkIns(mockState.db!)[0]).toMatchObject({ place_id: IDS.bar, checked_out_at: null });

    await post(inside);
    const [bar, cafe] = checkIns(mockState.db!);
    expect(bar).toMatchObject({ place_id: IDS.bar, checkout_reason: 'superseded' });
    expect(bar.checked_out_at).not.toBeNull();
    expect(cafe).toMatchObject({ place_id: IDS.cafe, checked_out_at: null });
  });

  it('closes a stale open check-in here before inserting', async () => {
    mockState.db!.rows('place_check_ins').push({
      id: 'old',
      place_id: IDS.cafe,
      user_id: IDS.viewer,
      checked_at: '2026-01-01T00:00:00.000Z',
      expires_at: '2026-01-01T03:00:00.000Z',
      checked_out_at: null,
      proof: 'gps',
      proof_weight: 0.8,
      share_with_connections: false,
    });
    const res = await post(inside);
    expect((await res.json()).refreshed).toBe(false);
    expect(checkIns(mockState.db!).find((r) => r.id === 'old')).toMatchObject({
      checked_out_at: '2026-01-01T03:00:00.000Z',
      checkout_reason: 'expired',
    });
  });

  it('snapshots the insights opt-out at write time', async () => {
    mockState.userId = IDS.friend;
    await post(inside);
    expect(checkIns(mockState.db!)[0].count_for_insights).toBe(false);
  });
});

describe('GET and DELETE /api/places/[placeId]/check-in', () => {
  it('reports the active check-in', async () => {
    let res = await GET(jsonRequest(`/api/places/${IDS.cafe}/check-in`, 'GET'), params);
    expect(await res.json()).toEqual({ checked_in: false });

    await post(inside);
    res = await GET(jsonRequest(`/api/places/${IDS.cafe}/check-in`, 'GET'), params);
    expect(await res.json()).toMatchObject({ checked_in: true, proof: 'gps', here_now_count: 1 });
  });

  it('checks out and asks the would-return question once', async () => {
    await post(inside);
    let res = await DELETE(jsonRequest(`/api/places/${IDS.cafe}/check-in`, 'DELETE'), params);
    expect(await res.json()).toEqual({ checked_in: false, ask_would_return: true });
    expect(checkIns(mockState.db!)[0].checkout_reason).toBe('user');

    // Idempotent once nothing is active.
    res = await DELETE(jsonRequest(`/api/places/${IDS.cafe}/check-in`, 'DELETE'), params);
    expect(await res.json()).toEqual({ checked_in: false, ask_would_return: false });
  });

  it('does not ask again after a recent would-return answer', async () => {
    await post(inside);
    mockState.db!.rows('place_pulses').push({
      id: 'p-wr',
      place_id: IDS.cafe,
      user_id: IDS.viewer,
      would_return: 1,
      energy: null,
      proof_weight: 0.8,
      created_at: new Date().toISOString(),
    });
    const res = await DELETE(jsonRequest(`/api/places/${IDS.cafe}/check-in`, 'DELETE'), params);
    expect(await res.json()).toEqual({ checked_in: false, ask_would_return: false });
  });
});
