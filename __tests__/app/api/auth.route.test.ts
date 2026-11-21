/** @jest-environment node */

import { NextRequest } from 'next/server';
import { POST } from '@/app/api/auth/route';
import { hostOnlyExpiry } from '@/lib/auth/cookieDomain';

const mockSignInWithPassword = jest.fn();
const mockSignUp = jest.fn();

let mockOptions: {
  cookieOptions?: { domain?: string };
  cookies: { setAll: (c: { name: string; value: string; options: object }[]) => void };
};

jest.mock('@supabase/ssr', () => ({
  createServerClient: (_url: string, _key: string, options: typeof mockOptions) => (mockOptions = options, {
    auth: {
      signInWithPassword: (...args: unknown[]) => mockSignInWithPassword(...args),
      signUp: (...args: unknown[]) => mockSignUp(...args),
    },
  }),
}));


describe('POST /api/auth', () => {
  beforeEach(() => {
    mockSignInWithPassword.mockReset();
    mockSignUp.mockReset();
  });

  it('never serializes access or refresh tokens after login', async () => {
    mockSignInWithPassword.mockResolvedValue({
      data: {
        user: {
          id: 'user-1',
          email: 'user@example.com',
          email_confirmed_at: '2026-09-01T00:00:00.000Z',
          created_at: '2026-08-01T00:00:00.000Z',
          app_metadata: { role: 'user' },
        },
        session: {
          access_token: 'must-not-leak',
          refresh_token: 'must-not-leak',
        },
      },
      error: null,
    });

    const response = await POST(
      new NextRequest('https://click.example/api/auth', {
        method: 'POST',
        body: JSON.stringify({ action: 'login', email: 'user@example.com', password: 'password-8' }),
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      success: true,
      user: {
        id: 'user-1',
        email: 'user@example.com',
        email_confirmed_at: '2026-09-01T00:00:00.000Z',
        created_at: '2026-08-01T00:00:00.000Z',
      },
    });
    expect(JSON.stringify(body)).not.toContain('token');
  });

  it('rejects passwords shorter than eight characters before contacting Supabase', async () => {
    const response = await POST(
      new NextRequest('https://click.example/api/auth', {
        method: 'POST',
        body: JSON.stringify({ action: 'signup', email: 'user@example.com', password: 'short' }),
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: 'Use an email address and a password with at least 8 characters',
    });
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it('allows legacy accounts with a nonempty password shorter than the current signup minimum to log in', async () => {
    mockSignInWithPassword.mockResolvedValue({
      data: {
        user: {
          id: 'legacy-user',
          email: 'legacy@example.com',
          email_confirmed_at: null,
          created_at: '2025-01-01T00:00:00.000Z',
        },
        session: { access_token: 'must-not-leak', refresh_token: 'must-not-leak' },
      },
      error: null,
    });

    const response = await POST(
      new NextRequest('https://click.example/api/auth', {
        method: 'POST',
        body: JSON.stringify({ action: 'login', email: 'legacy@example.com', password: 'short' }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mockSignInWithPassword).toHaveBeenCalledWith({
      email: 'legacy@example.com',
      password: 'short',
    });
    expect(JSON.stringify(await response.json())).not.toContain('token');
  });

  it("login on the shared domain deletes an older account's host-only session", async () => {
    const before = process.env.NEXT_PUBLIC_AUTH_COOKIE_DOMAIN;
    process.env.NEXT_PUBLIC_AUTH_COOKIE_DOMAIN = '.joinclick.co';
    const session = 'sb-lrgcwnmcscimkmslihxp-auth-token';
    mockSignInWithPassword.mockImplementation(async () => {
      mockOptions.cookies.setAll([
        { name: session, value: 'new', options: { ...mockOptions.cookieOptions, path: '/', maxAge: 100 } },
      ]);
      return { data: { user: { id: 'user-2', email: 'b@example.com' } }, error: null };
    });
    try {
      const response = await POST(
        new NextRequest('https://joinclick.co/api/auth', {
          method: 'POST',
          headers: { 'content-type': 'application/json', cookie: `${session}.0=old-0; ${session}.1=old-1` },
          body: JSON.stringify({ action: 'login', email: 'b@example.com', password: 'password123' }),
        }),
      );
      expect(response.status).toBe(200);
      const setCookies = response.headers.getSetCookie();
      expect(setCookies.find((c) => c.startsWith(`${session}=new`))).toMatch(/Domain=\.joinclick\.co/i);
      expect(setCookies).toEqual(
        expect.arrayContaining([hostOnlyExpiry(`${session}.0`), hostOnlyExpiry(`${session}.1`)]),
      );
    } finally {
      if (before === undefined) delete process.env.NEXT_PUBLIC_AUTH_COOKIE_DOMAIN;
      else process.env.NEXT_PUBLIC_AUTH_COOKIE_DOMAIN = before;
    }
  });
});
