/** @jest-environment node */

import { NextRequest } from 'next/server';
import { GET } from '@/app/api/auth/callback/route';
import { AUTH_COOKIE_DOMAIN_MARKER, hostOnlyExpiry } from '@/lib/auth/cookieDomain';

const SESSION = 'sb-lrgcwnmcscimkmslihxp-auth-token';
const mockVerifyOtp = jest.fn();
let mockOptions: {
  cookieOptions?: { domain?: string };
  cookies: { setAll: (c: { name: string; value: string; options: object }[]) => void };
};

jest.mock('@supabase/ssr', () => ({
  createServerClient: (_url: string, _key: string, options: typeof mockOptions) => {
    mockOptions = options;
    return { auth: { verifyOtp: (...args: unknown[]) => mockVerifyOtp(...args) } };
  },
}));

const before = process.env.NEXT_PUBLIC_AUTH_COOKIE_DOMAIN;
afterEach(() => {
  mockVerifyOtp.mockReset();
  if (before === undefined) delete process.env.NEXT_PUBLIC_AUTH_COOKIE_DOMAIN;
  else process.env.NEXT_PUBLIC_AUTH_COOKIE_DOMAIN = before;
});

function recovery(host: string, cookie: string) {
  return GET(
    new NextRequest(`https://${host}/api/auth/callback?token_hash=h&type=recovery`, { headers: { cookie } }),
  );
}

test("a reset link replaces another account's legacy host-only session, chunked differently", async () => {
  process.env.NEXT_PUBLIC_AUTH_COOKIE_DOMAIN = '.joinclick.co';
  mockVerifyOtp.mockImplementation(async () => {
    // Account B's recovery session fits in one cookie on the shared domain.
    mockOptions.cookies.setAll([
      { name: SESSION, value: 'account-b', options: { ...mockOptions.cookieOptions, path: '/', maxAge: 100 } },
    ]);
    return { error: null };
  });

  // Account A's session from before the switch: host-only, in two chunks.
  const response = await recovery('joinclick.co', `${SESSION}.0=account-a-0; ${SESSION}.1=account-a-1`);
  expect(response.headers.get('location')).toBe('https://joinclick.co/reset-password');

  const setCookies = response.headers.getSetCookie();
  expect(setCookies.find((c) => c.startsWith(`${SESSION}=account-b`))).toMatch(/Domain=\.joinclick\.co/i);
  expect(setCookies).toEqual(
    expect.arrayContaining([hostOnlyExpiry(`${SESSION}.0`), hostOnlyExpiry(`${SESSION}.1`)]),
  );
  expect(setCookies.find((c) => c.startsWith(`${AUTH_COOKIE_DOMAIN_MARKER}=`))).toMatch(/Domain=\.joinclick\.co/i);
  // Deletions are appended after every `cookies.set`, or NextResponse would drop them.
  expect(setCookies.slice(-2)).toEqual([hostOnlyExpiry(`${SESSION}.0`), hostOnlyExpiry(`${SESSION}.1`)]);
});

test('same name on both scopes: the domain write and the host-only deletion are separate headers', async () => {
  process.env.NEXT_PUBLIC_AUTH_COOKIE_DOMAIN = '.joinclick.co';
  mockVerifyOtp.mockImplementation(async () => {
    mockOptions.cookies.setAll([
      { name: SESSION, value: 'account-b', options: { ...mockOptions.cookieOptions, path: '/', maxAge: 100 } },
    ]);
    return { error: null };
  });
  const response = await recovery('joinclick.co', `${SESSION}=account-a`);
  const forName = response.headers.getSetCookie().filter((c) => c.startsWith(`${SESSION}=`));
  expect(forName).toHaveLength(2);
  expect(forName).toContain(hostOnlyExpiry(SESSION));
});

test('without a cookie domain the callback writes host-only cookies and deletes nothing extra', async () => {
  delete process.env.NEXT_PUBLIC_AUTH_COOKIE_DOMAIN;
  mockVerifyOtp.mockImplementation(async () => {
    mockOptions.cookies.setAll([{ name: SESSION, value: 'account-b', options: { path: '/', maxAge: 100 } }]);
    return { error: null };
  });
  const response = await recovery('joinclick.co', `${SESSION}.0=account-a-0`);
  const setCookies = response.headers.getSetCookie();
  expect(setCookies).toHaveLength(1);
  expect(setCookies[0]).toMatch(/^sb-lrgcwnmcscimkmslihxp-auth-token=account-b/);
  expect(setCookies[0]).not.toMatch(/domain=/i);
});
