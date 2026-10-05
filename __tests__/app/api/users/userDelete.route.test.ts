/**
 * @jest-environment node
 */

import { NextRequest } from 'next/server';
import { DELETE } from '@/app/api/user/delete/route';

const mockGetSupabaseFromRouteRequest = jest.fn();
const mockDeleteUser = jest.fn();
const mockReportsEq = jest.fn();
const mockRemoveDropMedia = jest.fn();

jest.mock('@/lib/server/supabaseRouteAuth', () => ({
  getSupabaseFromRouteRequest: (...args: unknown[]) => mockGetSupabaseFromRouteRequest(...args),
}));
jest.mock('@/lib/server/drops/storage', () => ({
  removeAllDropMediaForUser: (...args: unknown[]) => mockRemoveDropMedia(...args),
}));
jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({ delete: () => ({ eq: mockReportsEq }) }),
    auth: { admin: { deleteUser: mockDeleteUser } },
  }),
}));

const USER_ID = 'user-delete-1';

function del(headers: Record<string, string> = {}) {
  return DELETE(new NextRequest('http://localhost/api/user/delete', { method: 'DELETE', headers }));
}

describe('DELETE /api/user/delete', () => {
  const env = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...env, SUPABASE_SERVICE_ROLE_KEY: 'service', NEXT_PUBLIC_SUPABASE_URL: 'http://supabase.test' };
    mockDeleteUser.mockResolvedValue({ error: null });
    mockReportsEq.mockResolvedValue({ error: null });
    mockRemoveDropMedia.mockResolvedValue(undefined);
  });

  afterAll(() => {
    process.env = env;
  });

  it('deletes the bearer-authenticated user (iOS in-app deletion)', async () => {
    mockGetSupabaseFromRouteRequest.mockResolvedValue({ supabase: {}, user: { id: USER_ID }, authError: null });

    const res = await del({ authorization: 'Bearer token' });

    expect(res.status).toBe(200);
    expect(mockRemoveDropMedia).toHaveBeenCalledWith(expect.anything(), USER_ID);
    expect(mockReportsEq).toHaveBeenCalledWith('reporter_id', USER_ID);
    expect(mockDeleteUser).toHaveBeenCalledWith(USER_ID);
  });

  it('rejects an unauthenticated request without deleting anything', async () => {
    mockGetSupabaseFromRouteRequest.mockResolvedValue({ supabase: {}, user: null, authError: new Error('expired') });

    const res = await del({ authorization: 'Bearer stale' });

    expect(res.status).toBe(401);
    expect(mockDeleteUser).not.toHaveBeenCalled();
    expect(mockRemoveDropMedia).not.toHaveBeenCalled();
  });
});
