/** @jest-environment node */

import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';
import { AUTH_COOKIE_CLEANUP_MARKER, AUTH_COOKIE_DOMAIN_MARKER, hostOnlyExpiry } from '@/lib/auth/cookieDomain';

const SESSION = 'sb-lrgcwnmcscimkmslihxp-auth-token';
let mockOptions: {
  cookieOptions?: { domain?: string };
  cookies: { setAll: (c: { name: string; value: string; options: object }[]) => void };
};
let mockRefresh: (() => void) | null = null;
const mockGetClaims = jest.fn();

jest.mock('@supabase/ssr', () => ({
  createServerClient: (_url: string, _key: string, options: typeof mockOptions) => {
    mockOptions = options;
    return {
      auth: {
        getClaims: async () => {
          mockGetClaims();
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

const get = (url: string, cookie: string, method = 'GET') =>
  middleware(new NextRequest(url, { method, headers: { cookie } }));

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
  // Past the cleanup reload (marker set), a remaining duplicate is read and fixed in place.
  const response = await get(
    'https://joinclick.co/me',
    `${SESSION}=old-host-only; ${SESSION}=domain; ${AUTH_COOKIE_DOMAIN_MARKER}=.joinclick.co; ${AUTH_COOKIE_CLEANUP_MARKER}=1`,
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

describe('conflicting host-only and domain sessions', () => {
  beforeEach(() => mockGetClaims.mockReset());

  it.each([
    ['chunks of two sessions', `${SESSION}.0=a0; ${SESSION}.1=a1; ${SESSION}.2=a2; ${SESSION}.0=b0; ${SESSION}.1=b1`],
    ['a stale whole cookie beside chunks', `${SESSION}=old; ${SESSION}.0=b0; ${SESSION}.1=b1; ${AUTH_COOKIE_DOMAIN_MARKER}=.joinclick.co`],
  ])('%s: deletes the host-only family and reloads before reading the session', async (_label, cookie) => {
    const response = await get('https://joinclick.co/me?tab=1', cookie);
    expect(mockGetClaims).not.toHaveBeenCalled();
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://joinclick.co/me?tab=1');
    const setCookies = response.headers.getSetCookie();
    for (const name of new Set(cookie.split('; ').map((c) => c.split('=')[0]).filter((n) => n.startsWith('sb-')))) {
      expect(setCookies).toContain(hostOnlyExpiry(name));
    }
    expect(setCookies.some((c) => c.startsWith(`${AUTH_COOKIE_CLEANUP_MARKER}=1`))).toBe(true);
    // Only host-only deletions: the shared session on .joinclick.co is untouched.
    expect(setCookies.some((c) => /domain=/i.test(c))).toBe(false);
  });

  it('does not reload twice in a row (no redirect loop)', async () => {
    const response = await get('https://joinclick.co/me', `${SESSION}=old; ${SESSION}.0=b0; ${AUTH_COOKIE_CLEANUP_MARKER}=1`);
    expect(response.status).toBe(200);
    expect(mockGetClaims).toHaveBeenCalled();
  });

  it('never redirects a Server Action POST', async () => {
    const response = await get('https://joinclick.co/me', `${SESSION}=old; ${SESSION}.0=b0`, 'POST');
    expect(response.status).toBe(200);
    expect(response.headers.getSetCookie()).toContain(hostOnlyExpiry(SESSION));
  });
});
