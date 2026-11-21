/** @jest-environment node */

import { NextRequest } from 'next/server';
import { POST } from '@/app/api/auth/signout/route';
import { hostOnlyExpiry } from '@/lib/auth/cookieDomain';

const SESSION = 'sb-lrgcwnmcscimkmslihxp-auth-token';
const mockSignOut = jest.fn();
let mockSupabaseOptions: {
  cookieOptions?: { domain?: string };
  cookies: { setAll: (c: { name: string; value: string; options: object }[]) => void };
};

jest.mock('@supabase/ssr', () => ({
  createServerClient: (_url: string, _key: string, options: typeof mockSupabaseOptions) => {
    mockSupabaseOptions = options;
    return { auth: { signOut: (...args: unknown[]) => mockSignOut(...args) } };
  },
}));

function signOutRequest(host: string, cookie = `${SESSION}.0=a; ${SESSION}.1=b`) {
  return new NextRequest(`https://${host}/api/auth/signout`, { method: 'POST', headers: { cookie } });
}

const before = process.env.NEXT_PUBLIC_AUTH_COOKIE_DOMAIN;
afterEach(() => {
  mockSignOut.mockReset();
  if (before === undefined) delete process.env.NEXT_PUBLIC_AUTH_COOKIE_DOMAIN;
  else process.env.NEXT_PUBLIC_AUTH_COOKIE_DOMAIN = before;
});

test('signing out of this browser leaves the account signed in on its other devices', async () => {
  mockSignOut.mockResolvedValue({ error: null });
  const response = await POST(signOutRequest('localhost'));
  expect(response.status).toBe(200);
  // Supabase defaults to `global`, which revokes every session: the phone was signed out too.
  expect(mockSignOut).toHaveBeenCalledWith({ scope: 'local' });
});

test('with a shared cookie domain, sign-out deletes the domain cookie and the old host-only copy', async () => {
  process.env.NEXT_PUBLIC_AUTH_COOKIE_DOMAIN = '.joinclick.co';
  mockSignOut.mockImplementation(async () => {
    // What @supabase/ssr does on sign-out: remove each session chunk with the configured options.
    mockSupabaseOptions.cookies.setAll([
      { name: `${SESSION}.0`, value: '', options: { ...mockSupabaseOptions.cookieOptions, path: '/', maxAge: 0 } },
    ]);
    return { error: null };
  });

  const response = await POST(signOutRequest('joinclick.co'));
  expect(mockSupabaseOptions.cookieOptions).toEqual({ domain: '.joinclick.co' });

  const setCookies = response.headers.getSetCookie();
  for (const name of [`${SESSION}.0`, `${SESSION}.1`]) {
    // `.1` was not removed by Supabase (e.g. a failed revoke): deleted anyway.
    const domainDeletion = setCookies.find((c) => c.startsWith(`${name}=;`) && /Domain=\.joinclick\.co/i.test(c));
    expect(domainDeletion).toMatch(/Max-Age=0/);
    expect(setCookies).toContain(hostOnlyExpiry(name));
  }
});

test('without a cookie domain, sign-out stays host-only', async () => {
  delete process.env.NEXT_PUBLIC_AUTH_COOKIE_DOMAIN;
  mockSignOut.mockResolvedValue({ error: null });
  const response = await POST(signOutRequest('joinclick.co'));
  expect(mockSupabaseOptions.cookieOptions).toEqual({});
  const setCookies = response.headers.getSetCookie();
  expect(setCookies.some((c) => /domain=/i.test(c))).toBe(false);
  expect(setCookies.filter((c) => c.startsWith(`${SESSION}.`))).toHaveLength(2);
});
