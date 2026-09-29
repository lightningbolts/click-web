/**
 * @jest-environment node
 */

import { NextRequest, NextResponse } from 'next/server';

jest.mock('server-only', () => ({}));

const mockGetUser = jest.fn();
const mockRequireFeature = jest.fn();
const mockNudgeFor = jest.fn();

jest.mock('@/lib/server/supabaseRouteAuth', () => ({
  getSupabaseFromRouteRequest: (...args: unknown[]) => mockGetUser(...args),
}));
jest.mock('@/lib/server/admin/supabaseAdmin', () => ({ createAdminSupabaseClient: () => ({}) }));
jest.mock('@/lib/server/featureFlags', () => ({
  ...jest.requireActual('@/lib/server/featureFlags'),
  requireFeature: (...args: unknown[]) => mockRequireFeature(...args),
}));
jest.mock('@/lib/server/reconnectNearby', () => ({
  ...jest.requireActual('@/lib/server/reconnectNearby'),
  reconnectNudgeFor: (...args: unknown[]) => mockNudgeFor(...args),
}));

import { GET } from '@/app/api/nudges/reconnect/route';

const get = (query: string) => GET(new NextRequest(`https://click.example/api/nudges/reconnect${query}`));

describe('GET /api/nudges/reconnect', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUser.mockResolvedValue({ user: { id: 'me' }, authError: null });
    mockRequireFeature.mockResolvedValue({ ok: true, config: {} });
    mockNudgeFor.mockResolvedValue(null);
  });

  it('only ever uses coarse (~100 m) coordinates', async () => {
    const res = await get('?lat=47.655341&lng=-122.303517');
    expect(res.status).toBe(200);
    expect(mockNudgeFor.mock.calls[0][2]).toEqual({ lat: 47.655, lng: -122.304 });
  });

  it('requires a valid position', async () => {
    expect((await get('?lat=abc&lng=1')).status).toBe(400);
    expect((await get('?lat=91&lng=1')).status).toBe(400);
    expect(mockNudgeFor).not.toHaveBeenCalled();
  });

  it('is a 404 outside the cohort', async () => {
    mockRequireFeature.mockResolvedValue({ ok: false, response: NextResponse.json({}, { status: 404 }) });
    expect((await get('?lat=47.6&lng=-122.3')).status).toBe(404);
  });
});
