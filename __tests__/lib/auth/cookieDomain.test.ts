/** @jest-environment node */

import { NextResponse } from 'next/server';
import {
  AUTH_COOKIE_DOMAIN_MARKER,
  authCookieDomainFor,
  authCookieOptions,
  hasConflictingAuthCookies,
  hostOnlyExpiry,
  isSupabaseAuthCookieName,
  migrateAuthCookiesToDomain,
} from '@/lib/auth/cookieDomain';

const SESSION = 'sb-lrgcwnmcscimkmslihxp-auth-token';

describe('authCookieDomainFor', () => {
  it.each([
    ['joinclick.co', '.joinclick.co', '.joinclick.co'],
    ['www.joinclick.co', '.joinclick.co', '.joinclick.co'],
    ['kestrel.joinclick.co', 'joinclick.co', '.joinclick.co'],
    ['JoinClick.co:443', '.joinclick.co', '.joinclick.co'],
  ])('shares the cookie on %s (configured %s)', (host, configured, expected) => {
    expect(authCookieDomainFor(host, configured)).toBe(expected);
  });

  it.each([
    // Preview Workers and local dev keep host-only cookies; a foreign Domain would be rejected.
    ['click-web.example.workers.dev', '.joinclick.co'],
    ['localhost', '.joinclick.co'],
    ['notjoinclick.co', '.joinclick.co'],
    ['joinclick.co', undefined],
    ['joinclick.co', ''],
    ['joinclick.co', '.co'],
    [null, '.joinclick.co'],
  ])('stays host-only on %s (configured %s)', (host, configured) => {
    expect(authCookieDomainFor(host, configured)).toBeUndefined();
  });

  it('reads the build-time constant by default', () => {
    const before = process.env.NEXT_PUBLIC_AUTH_COOKIE_DOMAIN;
    process.env.NEXT_PUBLIC_AUTH_COOKIE_DOMAIN = '.joinclick.co';
    try {
      expect(authCookieOptions('joinclick.co')).toEqual({ domain: '.joinclick.co' });
      delete process.env.NEXT_PUBLIC_AUTH_COOKIE_DOMAIN;
      expect(authCookieOptions('joinclick.co')).toEqual({});
    } finally {
      if (before === undefined) delete process.env.NEXT_PUBLIC_AUTH_COOKIE_DOMAIN;
      else process.env.NEXT_PUBLIC_AUTH_COOKIE_DOMAIN = before;
    }
  });
});

describe('cookie helpers', () => {
  it('recognizes session chunks and the PKCE verifier as auth cookies', () => {
    expect(isSupabaseAuthCookieName(SESSION)).toBe(true);
    expect(isSupabaseAuthCookieName(`${SESSION}.1`)).toBe(true);
    expect(isSupabaseAuthCookieName(`${SESSION}-code-verifier`)).toBe(true);
    expect(isSupabaseAuthCookieName('click_biz_place')).toBe(false);
  });

  it.each([
    [`${SESSION}.0=a; theme=dark; ${SESSION}.0=b`, true], // host-only + domain copy of one name
    [`${SESSION}=old; ${SESSION}.0=a; ${SESSION}.1=b`, true], // whole and chunked at once
    [`${SESSION}.0=a; ${SESSION}.1=b`, false],
    [`${SESSION}=a; ${SESSION}-code-verifier=v`, false],
    ['theme=dark; theme=light', false], // not an auth cookie
    [null, false],
  ])('detects conflicting auth cookies in %p', (header, expected) => {
    expect(hasConflictingAuthCookies(header)).toBe(expected);
  });

  it('deletes only the host-only copy (no Domain attribute)', () => {
    const header = hostOnlyExpiry(SESSION);
    expect(header).toMatch(new RegExp(`^${SESSION}=;`));
    expect(header).toContain('Max-Age=0');
    expect(header).toContain('Path=/');
    expect(header.toLowerCase()).not.toContain('domain');
  });
});

describe('migrateAuthCookiesToDomain', () => {
  const cookies = [
    { name: `${SESSION}.0`, value: 'chunk0' },
    { name: `${SESSION}.1`, value: 'chunk1' },
    { name: 'theme', value: 'dark' },
  ];
  const header = cookies.map((c) => `${c.name}=${c.value}`).join('; ');

  it('rewrites host-only session cookies on the domain and deletes the host-only copies', () => {
    const response = NextResponse.next();
    migrateAuthCookiesToDomain(response, cookies, header, '.joinclick.co', true);
    const setCookies = response.headers.getSetCookie();

    for (const chunk of ['.0', '.1']) {
      const domainCopy = setCookies.find((c) => c.startsWith(`${SESSION}${chunk}=chunk`));
      expect(domainCopy).toMatch(/Domain=\.joinclick\.co/i);
      expect(domainCopy).toMatch(/Max-Age=34560000/);
      expect(setCookies).toContain(hostOnlyExpiry(`${SESSION}${chunk}`));
    }
    expect(setCookies.find((c) => c.startsWith(`${AUTH_COOKIE_DOMAIN_MARKER}=`))).toMatch(/Domain=\.joinclick\.co/i);
    expect(setCookies.some((c) => c.startsWith('theme='))).toBe(false);
  });

  it('keeps a value Supabase just refreshed instead of the stale request copy', () => {
    const response = NextResponse.next();
    response.cookies.set(`${SESSION}.0`, 'fresh', { domain: '.joinclick.co', path: '/' });
    migrateAuthCookiesToDomain(response, cookies, header, '.joinclick.co', true);
    const setCookies = response.headers.getSetCookie();
    expect(setCookies.filter((c) => c.startsWith(`${SESSION}.0=`) && !c.startsWith(`${SESSION}.0=;`))).toEqual([
      expect.stringContaining('fresh'),
    ]);
  });

  it('does nothing once migrated and no host-only copy is left', () => {
    const marked = [...cookies, { name: AUTH_COOKIE_DOMAIN_MARKER, value: '.joinclick.co' }];
    const response = NextResponse.next();
    migrateAuthCookiesToDomain(response, marked, header, '.joinclick.co', true);
    expect(response.headers.getSetCookie()).toEqual([]);
  });

  it('cleans up again when a host-only copy comes back', () => {
    const marked = [...cookies, { name: AUTH_COOKIE_DOMAIN_MARKER, value: '.joinclick.co' }];
    const response = NextResponse.next();
    migrateAuthCookiesToDomain(response, marked, `${header}; ${SESSION}.0=old`, '.joinclick.co', true);
    expect(response.headers.getSetCookie()).toContain(hostOnlyExpiry(`${SESSION}.0`));
  });

  it('cleans up when an old whole cookie sits beside a migrated chunked session', () => {
    const marked = [...cookies, { name: SESSION, value: 'old' }, { name: AUTH_COOKIE_DOMAIN_MARKER, value: '.joinclick.co' }];
    const response = NextResponse.next();
    migrateAuthCookiesToDomain(response, marked, `${SESSION}=old; ${header}`, '.joinclick.co', true);
    expect(response.headers.getSetCookie()).toContain(hostOnlyExpiry(SESSION));
  });

  it('leaves signed-out browsers alone', () => {
    const response = NextResponse.next();
    migrateAuthCookiesToDomain(response, [{ name: 'theme', value: 'dark' }], 'theme=dark', '.joinclick.co', true);
    expect(response.headers.getSetCookie()).toEqual([]);
  });
});
