/**
 * @jest-environment node
 */

import { NextRequest } from 'next/server';

const mockGetSupabaseFromRouteRequest = jest.fn();
const mockCreateAdminClient = jest.fn();
const mockLoadActivityRecap = jest.fn();

jest.mock('@/lib/server/supabaseRouteAuth', () => ({
  getSupabaseFromRouteRequest: (...args: unknown[]) => mockGetSupabaseFromRouteRequest(...args),
}));

jest.mock('@/lib/server/connectionWriteAuth', () => ({
  createAdminClient: () => mockCreateAdminClient(),
}));

jest.mock('@/lib/me/activityRecap', () => ({
  loadActivityRecap: (...args: unknown[]) => mockLoadActivityRecap(...args),
}));

describe('GET /api/me/recap', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 401 when unauthenticated', async () => {
    mockGetSupabaseFromRouteRequest.mockResolvedValue({
      user: null,
      authError: new Error('no session'),
    });
    const { GET } = await import('@/app/api/me/recap/route');
    const res = await GET(new NextRequest('http://localhost/api/me/recap'));
    expect(res.status).toBe(401);
  });

  it('returns the recap for the caller', async () => {
    mockGetSupabaseFromRouteRequest.mockResolvedValue({
      user: { id: 'user-1' },
      authError: null,
    });
    mockCreateAdminClient.mockReturnValue({});
    mockLoadActivityRecap.mockResolvedValue({
      window: 'week',
      since: '2026-08-06T12:00:00.000Z',
      connections_formed: 2,
      messages_sent: 4,
      messages_received: 5,
      beacons_created: 1,
      events_rsvped: 0,
      events_checked_in: 0,
      events_saved: 3,
    });
    const { GET } = await import('@/app/api/me/recap/route');
    const res = await GET(new NextRequest('http://localhost/api/me/recap?window=week'));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      recap: expect.objectContaining({ connections_formed: 2, events_saved: 3 }),
    });
  });
});
