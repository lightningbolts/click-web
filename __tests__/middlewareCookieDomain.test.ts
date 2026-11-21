/** @jest-environment node */

import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';
import { AUTH_COOKIE_DOMAIN_MARKER, hostOnlyExpiry } from '@/lib/auth/cookieDomain';

const SESSION = 'sb-lrgcwnmcscimkmslihxp-auth-token';
let mockOptions: {
  cookieOptions?: { domain?: string };
  cookies: { setAll: (c: { name: string; value: string; options: object }[]) => void };
};
let mockRefresh: (() => void) | null = null;

jest.mock('@supabase/ssr', () => ({
  createServerClient: (_url: string, _key: string, options: typeof mockOptions) => {
    mockOptions = options;
    return {
      auth: {
        getClaims: async () => {
          mockRefresh?.();
          return { data: { claims: { sub: 'user-1', app_metadata: {} } } };
        },
      },
    };
  },
}));

const before = process.env.NEXT_PUBLIC_AUTH_COOKIE_DOMAIN;
beforeEach(() => {
  process.env.NEXT_PUBLIC_AUTH_COOKIE_DOMAIN = '.joinclick.co';
  mockRefresh = null;
});
afterAll(() => {
  if (before === undefined) delete process.env.NEXT_PUBLIC_AUTH_COOKIE_DOMAIN;
  else process.env.NEXT_PUBLIC_AUTH_COOKIE_DOMAIN = before;
});

const get = (url: string, cookie: string) => middleware(new NextRequest(url, { headers: { cookie } }));

test('a signed-in visitor with host-only cookies is moved onto .joinclick.co', async () => {
  const response = await get('https://joinclick.co/me', `${SESSION}=session`);
  expect(mockOptions.cookieOptions).toEqual({ domain: '.joinclick.co' });

  const setCookies = response.headers.getSetCookie();
  expect(setCookies.find((c) => c.startsWith(`${SESSION}=session`))).toMatch(/Domain=\.joinclick\.co/i);
  expect(setCookies).toContain(hostOnlyExpiry(SESSION));
  // Raw host-only deletions come after every `cookies.set`, or NextResponse would drop them.
  expect(setCookies[setCookies.length - 1]).toBe(hostOnlyExpiry(SESSION));
});

test('a refreshed session is written once, on the domain, and the host-only copy deleted', async () => {
  mockRefresh = () =>
    mockOptions.cookies.setAll([
      { name: SESSION, value: 'refreshed', options: { ...mockOptions.cookieOptions, path: '/', maxAge: 100 } },
    ]);
  const response = await get(
    'https://joinclick.co/me',
    `${SESSION}=old-host-only; ${SESSION}=domain; ${AUTH_COOKIE_DOMAIN_MARKER}=.joinclick.co`,
  );
  const setCookies = response.headers.getSetCookie();
  const sessions = setCookies.filter((c) => c.startsWith(`${SESSION}=`) && !c.startsWith(`${SESSION}=;`));
  expect(sessions).toHaveLength(1);
  expect(sessions[0]).toMatch(/^sb-lrgcwnmcscimkmslihxp-auth-token=refreshed;.*Domain=\.joinclick\.co/i);
  expect(setCookies).toContain(hostOnlyExpiry(SESSION));
});

test('a redirect keeps the refreshed cookie options (domain) when copying cookies', async () => {
  mockRefresh = () =>
    mockOptions.cookies.setAll([
      { name: SESSION, value: 'refreshed', options: { ...mockOptions.cookieOptions, path: '/', maxAge: 100 } },
    ]);
  // Non-admin on /admin → redirect home, carrying the refreshed session.
  const response = await get('https://joinclick.co/admin', `${SESSION}=s; ${AUTH_COOKIE_DOMAIN_MARKER}=.joinclick.co`);
  expect(response.status).toBe(307);
  expect(response.headers.getSetCookie().find((c) => c.startsWith(`${SESSION}=refreshed`))).toMatch(
    /Domain=\.joinclick\.co/i,
  );
});

test('already migrated: no extra Set-Cookie headers', async () => {
  const response = await get('https://joinclick.co/me', `${SESSION}=domain; ${AUTH_COOKIE_DOMAIN_MARKER}=.joinclick.co`);
  expect(response.headers.getSetCookie()).toEqual([]);
});

test('preview hosts and unset domain stay host-only', async () => {
  const preview = await get('https://click-web.example.workers.dev/me', `${SESSION}=s`);
  expect(mockOptions.cookieOptions).toEqual({});
  expect(preview.headers.getSetCookie()).toEqual([]);

  delete process.env.NEXT_PUBLIC_AUTH_COOKIE_DOMAIN;
  const local = await get('http://localhost:3000/me', `${SESSION}=s`);
  expect(mockOptions.cookieOptions).toEqual({});
  expect(local.headers.getSetCookie()).toEqual([]);
});
