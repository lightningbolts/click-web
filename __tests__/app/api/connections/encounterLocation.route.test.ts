/**
 * @jest-environment node
 */

import { NextRequest } from 'next/server';
import { POST } from '@/app/api/connections/encounter-location/route';

const mockGetSupabaseFromRouteRequest = jest.fn();
const mockApply = jest.fn();

jest.mock('@/lib/server/supabaseRouteAuth', () => ({
  getSupabaseFromRouteRequest: (...args: unknown[]) => mockGetSupabaseFromRouteRequest(...args),
}));
jest.mock('@/lib/server/connectionWriteAuth', () => ({ createAdminClient: () => ({}) }));
jest.mock('@/lib/server/encounterLocationFollowUp', () => ({
  applyLocationFollowUp: (...args: unknown[]) => mockApply(...args),
}));

const CONN = '7a482d2d-6a4b-4e96-b855-7d2ce8642342';
const body = {
  connection_ids: [CONN, CONN],
  connection_moment: '2026-10-06T00:43:08.831Z',
  observed_at: '2026-10-06T00:43:21.000Z',
  gps_lat: 47.65292,
  gps_lon: -122.30413,
  gps_horizontal_accuracy_m: 4.8,
};

const request = (payload: unknown) =>
  new NextRequest('http://localhost/api/connections/encounter-location', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

describe('POST /api/connections/encounter-location', () => {
  beforeEach(() => {
    mockGetSupabaseFromRouteRequest.mockReset();
    mockApply.mockReset();
  });

  it('requires a signed-in user', async () => {
    mockGetSupabaseFromRouteRequest.mockResolvedValue({ user: null, authError: new Error('no') });
    expect((await POST(request(body))).status).toBe(401);
    expect(mockApply).not.toHaveBeenCalled();
  });

  it('rejects malformed bodies', async () => {
    mockGetSupabaseFromRouteRequest.mockResolvedValue({ user: { id: 'user-1' }, authError: null });
    expect((await POST(request({ ...body, connection_ids: [] }))).status).toBe(400);
    expect((await POST(request({ ...body, gps_lat: 'north' }))).status).toBe(400);
    expect(mockApply).not.toHaveBeenCalled();
  });

  it('surfaces validation failures and applies valid follow-ups', async () => {
    mockGetSupabaseFromRouteRequest.mockResolvedValue({ user: { id: 'user-1' }, authError: null });
    mockApply.mockResolvedValueOnce({ ok: false, status: 400, error: 'Accuracy out of range' });
    expect((await POST(request(body))).status).toBe(400);

    mockApply.mockResolvedValueOnce({ ok: true, updated: 3 });
    const response = await POST(request(body));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ updated: 3 });
    expect(mockApply).toHaveBeenLastCalledWith({}, 'user-1', {
      connectionIds: [CONN],
      connectionMoment: body.connection_moment,
      observedAt: body.observed_at,
      lat: 47.65292,
      lon: -122.30413,
      accuracyM: 4.8,
    });
  });
});
