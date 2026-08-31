/**
 * @jest-environment node
 */

import { NextRequest } from 'next/server';
import { GET as getGuestList, POST as postGuestList } from '@/app/api/beacons/[beaconId]/guest-list/route';
import { GET as getTeaser } from '@/app/api/me/event-bookmarks/[beaconId]/teaser/route';
import { GET as getNudges } from '@/app/api/me/nudges/route';
import { GET as cronNudges } from '@/app/api/cron/nudges-reconnect/route';

const mockGetSupabaseFromRouteRequest = jest.fn();
const mockCreateAdminSupabaseClient = jest.fn();
const mockRequireEventManager = jest.fn();
const mockCreateAdminClient = jest.fn();

jest.mock('@/lib/server/supabaseRouteAuth', () => ({
  getSupabaseFromRouteRequest: (...args: unknown[]) => mockGetSupabaseFromRouteRequest(...args),
}));

jest.mock('@/lib/server/admin/supabaseAdmin', () => ({
  createAdminSupabaseClient: () => mockCreateAdminSupabaseClient(),
}));

jest.mock('@/lib/events/requireEventManager', () => ({
  requireEventManager: (...args: unknown[]) => mockRequireEventManager(...args),
}));

jest.mock('@/lib/server/connectionWriteAuth', () => ({
  createAdminClient: () => mockCreateAdminClient(),
}));

const BEACON_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function jsonRequest(url: string, init?: { method?: string; body?: string; headers?: Record<string, string> }) {
  return new NextRequest(url, init);
}

describe('guest-list / teaser / nudges contracts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects organizer guest-list without manager auth', async () => {
    mockRequireEventManager.mockResolvedValue({
      ok: false,
      response: Response.json({ error: 'Unauthorized' }, { status: 401 }),
    });
    const res = await getGuestList(jsonRequest(`http://localhost/api/beacons/${BEACON_ID}/guest-list`), {
      params: Promise.resolve({ beaconId: BEACON_ID }),
    });
    expect(res.status).toBe(401);
  });

  it('rejects empty invalid JSON guest-list post via manager path', async () => {
    mockRequireEventManager.mockResolvedValue({
      ok: true,
      admin: {},
      userId: USER_ID,
      beacon: { id: BEACON_ID },
    });
    const res = await postGuestList(
      jsonRequest(`http://localhost/api/beacons/${BEACON_ID}/guest-list`, {
        method: 'POST',
        body: 'not-json',
        headers: { 'content-type': 'application/json' },
      }),
      { params: Promise.resolve({ beaconId: BEACON_ID }) },
    );
    expect(res.status).toBe(400);
  });

  it('returns 401 for attendee teaser without session', async () => {
    mockGetSupabaseFromRouteRequest.mockResolvedValue({ user: null, authError: 'missing' });
    const res = await getTeaser(jsonRequest(`http://localhost/api/me/event-bookmarks/${BEACON_ID}/teaser`), {
      params: Promise.resolve({ beaconId: BEACON_ID }),
    });
    expect(res.status).toBe(401);
  });

  it('returns 401 for nudges without session', async () => {
    mockGetSupabaseFromRouteRequest.mockResolvedValue({ user: null, authError: 'missing' });
    const res = await getNudges(jsonRequest('http://localhost/api/me/nudges'));
    expect(res.status).toBe(401);
  });

  it('returns 401 for reconnect cron without secret', async () => {
    const res = await cronNudges(jsonRequest('http://localhost/api/cron/nudges-reconnect'));
    expect(res.status).toBe(401);
  });
});
