/**
 * @jest-environment node
 */

import { NextRequest, NextResponse } from 'next/server';

jest.mock('server-only', () => ({}));

const mockGetUser = jest.fn();
const mockRequireFeature = jest.fn();
const mockLoadVisibleAlertBeacon = jest.fn();
const mockLoadAlertVotes = jest.fn();
const mockRecordAlertVote = jest.fn();
const mockExtendAlert = jest.fn();
const mockClearAlert = jest.fn();

jest.mock('@/lib/server/supabaseRouteAuth', () => ({
  getSupabaseFromRouteRequest: (...args: unknown[]) => mockGetUser(...args),
}));
jest.mock('@/lib/server/admin/supabaseAdmin', () => ({ createAdminSupabaseClient: () => ({}) }));
jest.mock('@/lib/server/featureFlags', () => ({
  ...jest.requireActual('@/lib/server/featureFlags'),
  requireFeature: (...args: unknown[]) => mockRequireFeature(...args),
}));
jest.mock('@/lib/server/alertConfirmations', () => {
  const actual = jest.requireActual('@/lib/server/alertConfirmations');
  return {
    alertConfigFrom: actual.alertConfigFrom,
    loadVisibleAlertBeacon: (...args: unknown[]) => mockLoadVisibleAlertBeacon(...args),
    loadAlertVotes: (...args: unknown[]) => mockLoadAlertVotes(...args),
    recordAlertVote: (...args: unknown[]) => mockRecordAlertVote(...args),
    extendAlert: (...args: unknown[]) => mockExtendAlert(...args),
    clearAlert: (...args: unknown[]) => mockClearAlert(...args),
  };
});

import { POST } from '@/app/api/beacons/[beaconId]/confirm/route';

const BEACON_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PIN = { lat: 47.6553, lng: -122.3035 };

function post(body: Record<string, unknown>) {
  return POST(
    new NextRequest(`https://click.example/api/beacons/${BEACON_ID}/confirm`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ beaconId: BEACON_ID }) },
  );
}

describe('POST /api/beacons/[beaconId]/confirm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUser.mockResolvedValue({ user: { id: USER_ID }, authError: null });
    mockRequireFeature.mockResolvedValue({ ok: true, config: {} });
    mockLoadAlertVotes.mockResolvedValue([]);
    mockLoadVisibleAlertBeacon.mockResolvedValue({
      beacon: {
        id: BEACON_ID,
        creatorId: 'creator',
        createdAtMs: Date.now() - 60_000,
        expiresAtMs: Date.now() + 60 * 60_000,
        clearedAt: null,
        ...PIN,
      },
    });
  });

  it('is a 404 outside the alert_confirmations cohort', async () => {
    mockRequireFeature.mockResolvedValue({ ok: false, response: NextResponse.json({ error: 'Not found' }, { status: 404 }) });
    const res = await post({ status: 'still_here', ...PIN });
    expect(res.status).toBe(404);
    expect(mockRecordAlertVote).not.toHaveBeenCalled();
  });

  it('rejects voters far from the pin without recording anything', async () => {
    const res = await post({ status: 'still_here', lat: PIN.lat + 0.01, lng: PIN.lng });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: 'out_of_range' });
    expect(mockRecordAlertVote).not.toHaveBeenCalled();
    expect(mockExtendAlert).not.toHaveBeenCalled();
  });

  it('records "still here" and extends the alert', async () => {
    const res = await post({ status: 'still_here', ...PIN });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ outcome: 'extended' });
    expect(mockRecordAlertVote).toHaveBeenCalledWith(expect.anything(), BEACON_ID, USER_ID, 'still_here');
    expect(mockExtendAlert).toHaveBeenCalledWith(expect.anything(), BEACON_ID, expect.any(Number));
  });

  it('clears for everyone once the threshold is met', async () => {
    mockLoadAlertVotes.mockResolvedValue([{ userId: 'bob', status: 'cleared', createdAtMs: Date.now() - 60_000 }]);
    const res = await post({ status: 'cleared', ...PIN });
    expect(await res.json()).toMatchObject({ outcome: 'cleared' });
    expect(mockClearAlert).toHaveBeenCalledWith(expect.anything(), BEACON_ID, expect.any(Number));
  });

  it('refuses votes on an already-cleared alert', async () => {
    mockLoadVisibleAlertBeacon.mockResolvedValue({
      beacon: { id: BEACON_ID, creatorId: 'creator', createdAtMs: 0, expiresAtMs: 0, clearedAt: '2026-10-05T18:00:00Z', ...PIN },
    });
    const res = await post({ status: 'cleared', ...PIN });
    expect(res.status).toBe(410);
  });
});
