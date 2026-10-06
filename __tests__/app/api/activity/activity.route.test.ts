/**
 * @jest-environment node
 */

import { NextRequest } from 'next/server';

jest.mock('server-only', () => ({}));

const mockGetUser = jest.fn();
const mockLoad = jest.fn();
const mockSeen = jest.fn();
const mockPending = jest.fn();

jest.mock('@/lib/server/supabaseRouteAuth', () => ({
  getSupabaseFromRouteRequest: (...args: unknown[]) => mockGetUser(...args),
}));
jest.mock('@/lib/server/admin/supabaseAdmin', () => ({ createAdminSupabaseClient: () => ({}) }));
jest.mock('@/lib/server/activity', () => ({
  loadActivity: (...a: unknown[]) => mockLoad(...a),
  markActivitySeen: (...a: unknown[]) => mockSeen(...a),
  pendingPriorRequests: (...a: unknown[]) => mockPending(...a),
}));

import { GET } from '@/app/api/activity/route';
import { POST } from '@/app/api/activity/seen/route';

describe('activity routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUser.mockResolvedValue({ user: { id: 'me' }, authError: null });
    mockLoad.mockResolvedValue({ items: [], seen_at: null, next_before: null });
    mockSeen.mockResolvedValue(undefined);
    mockPending.mockResolvedValue(new Set());
  });

  it('GET pages the viewer’s own activity', async () => {
    const res = await GET(new NextRequest('https://click.example/api/activity?before=2026-10-01T00:00:00Z'));
    expect(res.status).toBe(200);
    expect(mockLoad).toHaveBeenCalledWith(expect.anything(), 'me', { before: '2026-10-01T00:00:00Z' });
    expect(await res.json()).toEqual({ items: [], seen_at: null, next_before: null, pending_requests: [] });
  });

  it('GET flags prior requests still waiting on the viewer', async () => {
    const item = { id: 'a1', type: 'prior_connection_request', title: 'Sam wants to Click', body: '', data: { connection_id: 'c1' }, created_at: '2026-10-01T00:00:00Z', actor: null };
    mockLoad.mockResolvedValue({ items: [item], seen_at: null, next_before: null });
    mockPending.mockResolvedValue(new Set(['c1']));
    const res = await GET(new NextRequest('https://click.example/api/activity'));
    expect(mockPending).toHaveBeenCalledWith(expect.anything(), 'me', ['c1']);
    expect((await res.json()).pending_requests).toEqual(['c1']);
  });

  it('GET rejects a bad cursor and signed-out callers', async () => {
    expect((await GET(new NextRequest('https://click.example/api/activity?before=nope'))).status).toBe(400);
    mockGetUser.mockResolvedValueOnce({ user: null, authError: new Error('x') });
    expect((await GET(new NextRequest('https://click.example/api/activity'))).status).toBe(401);
  });

  it('POST seen marks up to the given item', async () => {
    const post = (body: unknown) =>
      POST(new NextRequest('https://click.example/api/activity/seen', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
      }));
    expect((await post({ seen_at: '2026-10-03T00:00:00Z' })).status).toBe(200);
    expect(mockSeen).toHaveBeenCalledWith(expect.anything(), 'me', '2026-10-03T00:00:00Z');
    expect((await post({ seen_at: 'later' })).status).toBe(400);
  });
});
