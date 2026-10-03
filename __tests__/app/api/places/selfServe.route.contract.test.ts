/** @jest-environment node */

import { POST } from '@/app/api/places/route';
import { PATCH } from '@/app/api/places/[placeId]/route';
import { resetFeatureFlagCache } from '@/lib/server/featureFlags';
import type { FakeDb } from '../../../helpers/fakeSupabase';
import { ctx, IDS, jsonRequest, placesWorld } from '../../../helpers/placesWorld';

const mockState: { db: FakeDb | null; userId: string } = { db: null, userId: IDS.viewer };

jest.mock('@/lib/server/supabaseRouteAuth', () => ({
  getSupabaseFromRouteRequest: async () => ({ user: { id: mockState.userId }, supabase: {}, authError: null }),
}));
jest.mock('@/lib/server/admin/supabaseAdmin', () => ({ createAdminSupabaseClient: () => mockState.db!.client }));

const body = {
  name: 'Blue Door Café',
  category: 'restaurant',
  latitude: 47.61,
  longitude: -122.34,
  timezone: 'America/Los_Angeles',
  address_line: '12 Pike St',
  city: 'Seattle',
};
const create = (payload: unknown = body) => POST(jsonRequest('/api/places', 'POST', payload));

beforeEach(() => {
  resetFeatureFlagCache();
  mockState.userId = IDS.viewer;
  mockState.db = placesWorld({ flagOn: false });
});

describe('POST /api/places (self-serve setup)', () => {
  it('creates a pending, unlisted Place owned by the submitter', async () => {
    const res = await create();
    expect(res.status).toBe(201);
    const { place } = await res.json();
    expect(place).toMatchObject({ name: 'Blue Door Café', category: 'restaurant', verification_status: 'pending', listed: false, role: 'owner' });
    expect(place.slug).toBe('blue-door-cafe-seattle');
    expect(mockState.db!.rows('place_managers')).toContainEqual(expect.objectContaining({ place_id: place.id, user_id: IDS.viewer, role: 'owner' }));
  });

  it('accepts the organization categories and rejects unknown ones', async () => {
    expect((await create({ ...body, category: 'event_space' })).status).toBe(201);
    expect((await create({ ...body, name: 'Acme HQ', category: 'office' })).status).toBe(201);
    expect((await create({ ...body, category: 'church' })).status).toBe(400);
  });

  it('caps Places waiting for review', async () => {
    for (let i = 0; i < 3; i += 1) expect((await create({ ...body, name: `Spot ${i}` })).status).toBe(201);
    const res = await create({ ...body, name: 'One too many' });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('pending_limit');
  });
});

describe('PATCH listed (going live)', () => {
  const patch = (placeId: string, payload: unknown) => PATCH(jsonRequest(`/api/places/${placeId}`, 'PATCH', payload), ctx({ placeId }));

  it('lets the owner of a verified Place take it off the map and back', async () => {
    mockState.userId = IDS.manager;
    expect((await (await patch(IDS.cafe, { listed: false })).json()).place.listed).toBe(false);
    expect((await (await patch(IDS.cafe, { listed: true })).json()).place.listed).toBe(true);
  });

  it('waits for verification before a submitted Place can go live', async () => {
    const { place } = await (await create()).json();
    const res = await patch(place.id, { listed: true });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('not_verified');
  });

  it('is owner-only', async () => {
    mockState.userId = IDS.manager;
    mockState.db!.rows('place_managers')[0].role = 'manager';
    expect((await patch(IDS.cafe, { listed: false })).status).toBe(403);
  });
});
