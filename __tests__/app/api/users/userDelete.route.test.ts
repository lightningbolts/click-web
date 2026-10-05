/**
 * @jest-environment node
 */

import { NextRequest } from 'next/server';
import { DELETE } from '@/app/api/user/delete/route';

const mockGetSupabaseFromRouteRequest = jest.fn();
const mockDeleteUser = jest.fn();
const mockReportsEq = jest.fn();
const mockRemoveDropMedia = jest.fn();
const mockRevokeApple = jest.fn();

jest.mock('@/lib/server/supabaseRouteAuth', () => ({
  getSupabaseFromRouteRequest: (...args: unknown[]) => mockGetSupabaseFromRouteRequest(...args),
}));
jest.mock('@/lib/server/drops/storage', () => ({
  removeAllDropMediaForUser: (...args: unknown[]) => mockRemoveDropMedia(...args),
}));
jest.mock('@/lib/server/appleRevoke', () => ({
  ...jest.requireActual('@/lib/server/appleRevoke'),
  revokeAppleAuthorizationCode: (...args: unknown[]) => mockRevokeApple(...args),
}));
jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({ delete: () => ({ eq: mockReportsEq }) }),
    auth: { admin: { deleteUser: mockDeleteUser } },
  }),
}));

const USER_ID = 'user-delete-1';

function del(headers: Record<string, string> = {}, body?: unknown) {
  return DELETE(
    new NextRequest('http://localhost/api/user/delete', {
      method: 'DELETE',
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
}

describe('DELETE /api/user/delete', () => {
  const env = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...env, SUPABASE_SERVICE_ROLE_KEY: 'service', NEXT_PUBLIC_SUPABASE_URL: 'http://supabase.test' };
    mockDeleteUser.mockResolvedValue({ error: null });
    mockReportsEq.mockResolvedValue({ error: null });
    mockRemoveDropMedia.mockResolvedValue(undefined);
    mockRevokeApple.mockResolvedValue('revoked');
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

  it('revokes Apple tokens before deleting an Apple sign-in account', async () => {
    const order: string[] = [];
    mockRevokeApple.mockImplementation(async () => {
      order.push('revoke');
      return 'revoked';
    });
    mockDeleteUser.mockImplementation(async () => {
      order.push('delete');
      return { error: null };
    });
    mockGetSupabaseFromRouteRequest.mockResolvedValue({
      supabase: {},
      user: { id: USER_ID, app_metadata: { provider: 'apple', providers: ['apple'] } },
      authError: null,
    });

    const res = await del({ authorization: 'Bearer token' }, { apple_authorization_code: 'apple-code' });

    expect(res.status).toBe(200);
    expect(mockRevokeApple).toHaveBeenCalledWith('apple-code');
    expect(order).toEqual(['revoke', 'delete']);
  });

  it('still deletes when Apple revocation fails', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockRevokeApple.mockResolvedValue('exchange_failed');
    mockGetSupabaseFromRouteRequest.mockResolvedValue({
      supabase: {},
      user: { id: USER_ID, app_metadata: { providers: ['apple'] } },
      authError: null,
    });

    const res = await del({ authorization: 'Bearer token' }, { apple_authorization_code: 'stale' });

    expect(res.status).toBe(200);
    expect(mockDeleteUser).toHaveBeenCalledWith(USER_ID);
  });

  it('ignores an Apple code for an account without an Apple identity', async () => {
    mockGetSupabaseFromRouteRequest.mockResolvedValue({
      supabase: {},
      user: { id: USER_ID, app_metadata: { providers: ['email'] } },
      authError: null,
    });

    await del({ authorization: 'Bearer token' }, { apple_authorization_code: 'apple-code' });

    expect(mockRevokeApple).not.toHaveBeenCalled();
    expect(mockDeleteUser).toHaveBeenCalledWith(USER_ID);
  });

  it('rejects a malformed body without deleting', async () => {
    mockGetSupabaseFromRouteRequest.mockResolvedValue({ supabase: {}, user: { id: USER_ID }, authError: null });

    const res = await del({ authorization: 'Bearer token' }, { apple_authorization_code: 42 });

    expect(res.status).toBe(400);
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });
});
