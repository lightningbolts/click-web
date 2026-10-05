/**
 * @jest-environment node
 */

import { NextRequest } from 'next/server';
import { POST } from '@/app/api/connections/encounter-altitude/route';

const mockGetSupabaseFromRouteRequest = jest.fn();
const mockApply = jest.fn();

jest.mock('@/lib/server/supabaseRouteAuth', () => ({
  getSupabaseFromRouteRequest: (...args: unknown[]) => mockGetSupabaseFromRouteRequest(...args),
}));
jest.mock('@/lib/server/connectionWriteAuth', () => ({ createAdminClient: () => ({}) }));
jest.mock('@/lib/server/encounterAltitudeFollowUp', () => ({
  applyAltitudeFollowUp: (...args: unknown[]) => mockApply(...args),
}));

const CONN = '105eaba1-cbab-4aca-971c-8c07622757d8';
const body = {
  connection_ids: [CONN, CONN],
  connection_moment: '2026-10-05T15:29:43.325Z',
  observed_at: '2026-10-05T15:29:47.900Z',
  exact_barometric_elevation_m: 26.4,
  barometric_accuracy_m: 3.2,
};

const request = (payload: unknown) =>
  new NextRequest('http://localhost/api/connections/encounter-altitude', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

describe('POST /api/connections/encounter-altitude', () => {
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
    expect((await POST(request({ ...body, connection_ids: ['nope'] }))).status).toBe(400);
    expect((await POST(request({ ...body, exact_barometric_elevation_m: 'high' }))).status).toBe(400);
    expect(mockApply).not.toHaveBeenCalled();
  });

  it("applies the follow-up to the caller's rows", async () => {
    mockGetSupabaseFromRouteRequest.mockResolvedValue({ user: { id: 'user-1' }, authError: null });
    mockApply.mockResolvedValue({ ok: true, updated: 1 });
    const response = await POST(request(body));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ updated: 1 });
    expect(mockApply).toHaveBeenCalledWith({}, 'user-1', {
      connectionIds: [CONN],
      connectionMoment: body.connection_moment,
      observedAt: body.observed_at,
      altitudeM: 26.4,
      accuracyM: 3.2,
      precisionM: null,
    });
  });
});
