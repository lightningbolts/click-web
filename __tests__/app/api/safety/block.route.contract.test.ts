/**
 * @jest-environment node
 */

import { NextRequest } from 'next/server';
import { GET as blocksGet, DELETE as unblock } from '@/app/api/safety/block/route';
import { expectFilter, makeSupabaseMock, type QueryResult } from '../../../helpers/supabaseRouteMocks';

const mockGetSupabaseFromRouteRequest = jest.fn();

jest.mock('@/lib/server/supabaseRouteAuth', () => ({
  getSupabaseFromRouteRequest: (...args: unknown[]) => mockGetSupabaseFromRouteRequest(...args),
}));

const USER_ID = 'user-blocker-1';

function setup(userBlocks: QueryResult, user: Record<string, unknown> | null = { id: USER_ID }) {
  const mock = makeSupabaseMock({ tables: { user_blocks: userBlocks } });
  mockGetSupabaseFromRouteRequest.mockResolvedValue({
    supabase: mock.supabase,
    user,
    authError: user ? null : new Error('no session'),
  });
  return mock;
}

describe('GET /api/safety/block', () => {
  it('lists only the caller’s blocks with a stable shape', async () => {
    const mock = setup({
      data: [{ blocked_id: 'u-2', created_at: '2026-09-20T10:00:00Z' }],
      error: null,
    });
    const res = await blocksGet(new NextRequest('http://localhost/api/safety/block'));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      blocks: [{ blocked_id: 'u-2', blocked_at: '2026-09-20T10:00:00Z' }],
    });
    expectFilter(mock.builder('user_blocks'), 'blocker_id', USER_ID);
  });

  it('returns 401 without a user', async () => {
    setup({ data: [], error: null }, null);
    const res = await blocksGet(new NextRequest('http://localhost/api/safety/block'));
    expect(res.status).toBe(401);
  });
});

describe('DELETE /api/safety/block', () => {
  it('requires blocked_id and scopes the delete to the caller', async () => {
    const mock = setup({ data: null, error: null });
    const missing = await unblock(new NextRequest('http://localhost/api/safety/block', { method: 'DELETE' }));
    expect(missing.status).toBe(400);

    const res = await unblock(new NextRequest('http://localhost/api/safety/block?blocked_id=u-2', { method: 'DELETE' }));
    expect(res.status).toBe(200);
    expectFilter(mock.builder('user_blocks'), 'blocker_id', USER_ID);
    expectFilter(mock.builder('user_blocks'), 'blocked_id', 'u-2');
  });
});
