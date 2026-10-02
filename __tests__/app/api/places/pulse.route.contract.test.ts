/** @jest-environment node */

import { POST } from '@/app/api/places/[placeId]/pulse/route';
import { PATCH } from '@/app/api/places/[placeId]/pulse/[pulseId]/route';
import { resetFeatureFlagCache } from '@/lib/server/featureFlags';
import type { FakeDb } from '../../../helpers/fakeSupabase';
import { ctx, IDS, jsonRequest, placesWorld } from '../../../helpers/placesWorld';

const mockState: { db: FakeDb | null; userId: string | null } = { db: null, userId: IDS.viewer };
const mockEmit = jest.fn();

jest.mock('@/lib/server/supabaseRouteAuth', () => ({
  getSupabaseFromRouteRequest: async () => ({ user: { id: mockState.userId }, supabase: {}, authError: null }),
}));
jest.mock('@/lib/server/admin/supabaseAdmin', () => ({ createAdminSupabaseClient: () => mockState.db!.client }));
jest.mock('@/lib/server/rateLimit', () => ({ isRateLimited: async () => false }));
jest.mock('@/lib/server/telemetry/productEvents', () => ({ emitProductEvent: (...args: unknown[]) => mockEmit(...args) }));

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
const minutesAhead = (m: number) => new Date(Date.now() + m * 60_000).toISOString();

const pulse = (body: unknown, placeId: string = IDS.cafe) =>
  POST(jsonRequest(`/api/places/${placeId}/pulse`, 'POST', body), ctx({ placeId }));
const patch = (pulseId: string, body: unknown) =>
  PATCH(jsonRequest(`/api/places/${IDS.cafe}/pulse/${pulseId}`, 'PATCH', body), ctx({ placeId: IDS.cafe, pulseId }));

function checkIn(db: FakeDb, userId: string, overrides: Record<string, unknown> = {}) {
  db.rows('place_check_ins').push({
    id: `ci-${userId}`,
    place_id: IDS.cafe,
    user_id: userId,
    checked_at: minutesAgo(10),
    expires_at: minutesAhead(170),
    checked_out_at: null,
    proof: 'gps',
    proof_weight: 0.8,
    share_with_connections: false,
    ...overrides,
  });
}

beforeEach(() => {
  resetFeatureFlagCache();
  mockEmit.mockReset().mockResolvedValue(true);
  mockState.userId = IDS.viewer;
  mockState.db = placesWorld();
});

describe('POST /api/places/[placeId]/pulse', () => {
  it('returns 404 when the flag is off', async () => {
    mockState.db = placesWorld({ flagOn: false });
    expect((await pulse({ energy: 3 })).status).toBe(404);
  });

  it('refuses a user who is not present', async () => {
    const res = await pulse({ energy: 3 });
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('not_present');
    expect(mockState.db!.rows('place_pulses')).toHaveLength(0);
  });

  it('refuses a manager Pulsing their own Place', async () => {
    mockState.userId = IDS.manager;
    checkIn(mockState.db!, IDS.manager);
    const res = await pulse({ energy: 3 });
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('manager_pulse_not_allowed');
  });

  it('records a Pulse from a checked-in user and returns the summary', async () => {
    checkIn(mockState.db!, IDS.viewer);
    const res = await pulse({ energy: 3, talkable: 1, category_answer: 2 });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.pulse).toEqual({ id: expect.any(String), editable_until: expect.any(String) });
    expect(body.summary).toMatchObject({ state: 'live', label: 'lively', report_count: 1, confidence: 'low' });

    const [row] = mockState.db!.rows('place_pulses');
    expect(row).toMatchObject({
      proof: 'gps',
      proof_weight: 0.8,
      check_in_id: `ci-${IDS.viewer}`,
      energy: 3,
      talkable: 1,
      category_question: 'seats',
      category_answer: 2,
      count_for_insights: true,
    });
    expect(mockEmit).toHaveBeenCalledWith(expect.anything(), IDS.viewer, 'place_pulse', { has_energy: true, has_followup: true });
  });

  it('accepts presence from a recent verified handshake at the Place', async () => {
    mockState.db!.rows('connection_encounters').push({
      id: 'enc-1',
      connection_id: IDS.connFriend,
      place_id: IDS.cafe,
      reporting_user_id: IDS.viewer,
      encountered_at: minutesAgo(20),
    });
    const res = await pulse({ energy: 2 });
    expect(res.status).toBe(201);
    expect(mockState.db!.rows('place_pulses')[0]).toMatchObject({ proof: 'encounter', proof_weight: 1 });
  });

  it('rejects an empty or out-of-range Pulse', async () => {
    checkIn(mockState.db!, IDS.viewer);
    expect((await (await pulse({})).json()).code).toBe('empty_pulse');
    expect((await (await pulse({ energy: 9 })).json()).code).toBe('invalid_answer');
    expect((await (await pulse({ energy: 2, category_answer: 2 }, IDS.cafe)).status)).toBe(201);
  });

  it('rejects a category answer for a category without a question', async () => {
    mockState.db!.rows('places')[0].category = 'bookstore';
    checkIn(mockState.db!, IDS.viewer);
    const res = await pulse({ energy: 2, category_answer: 1 });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('invalid_answer');
  });

  it('enforces the energy cooldown', async () => {
    checkIn(mockState.db!, IDS.viewer);
    mockState.db!.rows('place_pulses').push({
      id: 'earlier',
      place_id: IDS.cafe,
      user_id: IDS.viewer,
      energy: 2,
      proof_weight: 0.8,
      created_at: minutesAgo(10),
    });
    const res = await pulse({ energy: 3 });
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.code).toBe('pulse_cooldown');
    expect(Date.parse(body.cooldown_until)).toBeGreaterThan(Date.now());
  });

  it('accepts a would-return-only answer shortly after checking out', async () => {
    checkIn(mockState.db!, IDS.viewer, { checked_out_at: minutesAgo(2), checkout_reason: 'user' });
    const res = await pulse({ would_return: 1 });
    expect(res.status).toBe(201);
    expect(mockState.db!.rows('place_pulses')[0]).toMatchObject({ energy: null, would_return: 1, proof: 'gps' });
  });

  it('refuses would-return long after leaving', async () => {
    checkIn(mockState.db!, IDS.viewer, { checked_out_at: minutesAgo(600), checkout_reason: 'user' });
    expect((await pulse({ would_return: 1 })).status).toBe(403);
  });
});

describe('PATCH /api/places/[placeId]/pulse/[pulseId]', () => {
  function seedPulse(overrides: Record<string, unknown> = {}) {
    mockState.db!.rows('place_pulses').push({
      id: 'mine',
      place_id: IDS.cafe,
      user_id: IDS.viewer,
      energy: 3,
      talkable: null,
      category_answer: null,
      proof_weight: 0.8,
      created_at: minutesAgo(2),
      ...overrides,
    });
  }

  it('fills an empty follow-up inside the edit window', async () => {
    seedPulse();
    const res = await patch('mine', { talkable: 0 });
    expect(res.status).toBe(200);
    expect((await res.json()).summary.talkable).toEqual({ yes: 0, no: 1 });
    expect(mockState.db!.rows('place_pulses')[0].talkable).toBe(0);
  });

  it('refuses after the edit window', async () => {
    seedPulse({ created_at: minutesAgo(30) });
    const res = await patch('mine', { talkable: 1 });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('pulse_not_editable');
  });

  it('refuses to overwrite an answered field', async () => {
    seedPulse({ talkable: 1 });
    expect((await patch('mine', { talkable: 0 })).status).toBe(409);
  });

  it("hides another user's Pulse", async () => {
    seedPulse({ user_id: IDS.friend });
    const res = await patch('mine', { talkable: 1 });
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe('pulse_not_found');
  });
});
