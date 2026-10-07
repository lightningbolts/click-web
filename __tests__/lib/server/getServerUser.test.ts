/**
 * @jest-environment node
 */

import { hasSupabaseAuthCookie } from '@/lib/server/getServerUser';

describe('hasSupabaseAuthCookie', () => {
  it('is false when the request has no cookies', () => {
    expect(hasSupabaseAuthCookie([])).toBe(false);
  });

  it('ignores PKCE verifier cookies', () => {
    expect(hasSupabaseAuthCookie(['sb-abc-auth-token-code-verifier'])).toBe(false);
  });

  it('detects a session cookie', () => {
    expect(hasSupabaseAuthCookie(['sb-abc-auth-token'])).toBe(true);
  });

  it('detects chunked session cookies', () => {
    expect(hasSupabaseAuthCookie(['sb-abc-auth-token.0', 'sb-abc-auth-token.1'])).toBe(true);
  });
});

describe('getServerUser', () => {
  const getClaims = jest.fn();
  const getUser = jest.fn();

  beforeEach(() => {
    jest.resetModules();
    getClaims.mockReset();
    getUser.mockReset();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon';
    jest.doMock('server-only', () => ({}));
    jest.doMock('next/headers', () => ({
      cookies: async () => ({ getAll: () => [{ name: 'sb-abc-auth-token', value: 'x' }] }),
    }));
    jest.doMock('@/lib/server/supabaseServer', () => ({
      createSupabaseServerClient: async () => ({ auth: { getClaims, getUser } }),
    }));
  });

  it('builds the user from locally verified claims without an Auth round-trip', async () => {
    getClaims.mockResolvedValue({
      data: {
        claims: {
          sub: 'u1',
          aud: 'authenticated',
          role: 'authenticated',
          email: 'ada@example.com',
          app_metadata: { role: 'admin' },
          user_metadata: { full_name: 'Ada Lovelace' },
        },
      },
    });
    const { getServerUser } = await import('@/lib/server/getServerUser');
    const user = await getServerUser();
    expect(user).toMatchObject({
      id: 'u1',
      email: 'ada@example.com',
      app_metadata: { role: 'admin' },
      user_metadata: { full_name: 'Ada Lovelace' },
    });
    expect(getUser).not.toHaveBeenCalled();
  });

  it('is null when the token does not verify', async () => {
    getClaims.mockResolvedValue({ data: null, error: new Error('invalid JWT') });
    const { getServerUser } = await import('@/lib/server/getServerUser');
    await expect(getServerUser()).resolves.toBeNull();
  });
});
