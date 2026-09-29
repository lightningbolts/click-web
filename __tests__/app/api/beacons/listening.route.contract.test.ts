/**
 * @jest-environment node
 */

import { NextRequest, NextResponse } from 'next/server';

jest.mock('server-only', () => ({}));

const mockGetUser = jest.fn();
const mockRequireFeature = jest.fn();
const mockLoadVisibleBeacon = jest.fn();
const mockLoadListening = jest.fn();
const mockUpsert = jest.fn();

jest.mock('@/lib/server/supabaseRouteAuth', () => ({
  getSupabaseFromRouteRequest: (...args: unknown[]) => mockGetUser(...args),
}));
jest.mock('@/lib/server/admin/supabaseAdmin', () => ({
  createAdminSupabaseClient: () => ({ from: () => ({ upsert: (...args: unknown[]) => mockUpsert(...args) }) }),
}));
jest.mock('@/lib/server/featureFlags', () => ({
  ...jest.requireActual('@/lib/server/featureFlags'),
  requireFeature: (...args: unknown[]) => mockRequireFeature(...args),
}));
jest.mock('@/lib/map/beaconVisibility', () => ({
  loadVisibleBeacon: (...args: unknown[]) => mockLoadVisibleBeacon(...args),
}));
jest.mock('@/lib/server/soundtrackPresence', () => ({
  ...jest.requireActual('@/lib/server/soundtrackPresence'),
  loadListening: (...args: unknown[]) => mockLoadListening(...args),
}));

import { POST } from '@/app/api/beacons/[beaconId]/listening/route';

const BEACON_ID = '22222222-2222-4222-8222-222222222222';
const PIN = { lat: 47.6553, lng: -122.3035 };

function soundtrack(overrides: Record<string, unknown> = {}) {
  return {
    beacon: {
      id: BEACON_ID,
      beacon_type: 'soundtrack',
      expires_at: new Date(Date.now() + 3_600_000).toISOString(),
      ...PIN,
      ...overrides,
    },
    row: {},
  };
}

function post(body: Record<string, unknown>) {
  return POST(
    new NextRequest(`https://click.example/api/beacons/${BEACON_ID}/listening`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ beaconId: BEACON_ID }) },
  );
}

describe('POST /api/beacons/[beaconId]/listening', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUser.mockResolvedValue({ user: { id: 'me' }, authError: null });
    mockRequireFeature.mockResolvedValue({ ok: true, config: {} });
    mockLoadVisibleBeacon.mockResolvedValue(soundtrack());
    mockUpsert.mockResolvedValue({ error: null });
    mockLoadListening.mockResolvedValue({ count: 1, is_listening: true, connections: [], heartbeat_seconds: 360 });
  });

  it('records an in-range heartbeat and returns the count', async () => {
    const res = await post(PIN);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ count: 1, is_listening: true });
    expect(mockUpsert).toHaveBeenCalledWith(expect.objectContaining({ beacon_id: BEACON_ID, user_id: 'me' }));
  });

  it('rejects listeners outside the area without recording them', async () => {
    const res = await post({ lat: PIN.lat + 0.01, lng: PIN.lng });
    expect(res.status).toBe(403);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('is a 404 for non-soundtrack or expired beacons and outside the cohort', async () => {
    mockLoadVisibleBeacon.mockResolvedValue(soundtrack({ beacon_type: 'study' }));
    expect((await post(PIN)).status).toBe(404);
    mockLoadVisibleBeacon.mockResolvedValue(soundtrack({ expires_at: new Date(Date.now() - 1000).toISOString() }));
    expect((await post(PIN)).status).toBe(404);
    mockRequireFeature.mockResolvedValue({ ok: false, response: NextResponse.json({}, { status: 404 }) });
    expect((await post(PIN)).status).toBe(404);
    expect(mockUpsert).not.toHaveBeenCalled();
  });
});
