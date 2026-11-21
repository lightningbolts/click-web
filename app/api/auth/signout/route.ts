import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import {
  appendHostOnlyExpiries,
  authCookieDomainFor,
  isSupabaseAuthCookieName,
} from '@/lib/auth/cookieDomain';

/**
 * Server-side sign-out handler.
 *
 * Ends this browser's Supabase session on the server and removes its auth cookies, so the
 * browser is fully signed out (not just on the client side). Other devices stay signed in.
 *
 * With `AUTH_COOKIE_DOMAIN` set the session cookie lives on `.joinclick.co` (shared with
 * kestrel.joinclick.co), and a browser from before that switch may still hold a host-only
 * copy of the same name. Both are deleted here.
 */
export async function POST(request: NextRequest) {
  try {
    const domain = authCookieDomainFor(request.nextUrl.hostname);
    const written: { name: string; value: string; options: CookieOptions }[] = [];
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookieOptions: domain ? { domain } : {},
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            written.push(...cookiesToSet);
          },
        },
      }
    );

    // This browser only: the default (`global`) revokes every session of the account, signing
    // its phones and other browsers out too. Settings › Sign out everywhere is the global one.
    await supabase.auth.signOut({ scope: 'local' });

    const response = NextResponse.json({ success: true });
    written.forEach(({ name, value, options }) => response.cookies.set(name, value, options));

    // Delete every auth cookie even when Supabase kept some (a failed revoke keeps the session),
    // including names it wrote during this request: a refresh can re-chunk the session under a
    // name the request didn't carry, and that live cookie must not survive sign-out.
    const authNames = [
      ...new Set([...request.cookies.getAll().map((c) => c.name), ...written.map((c) => c.name)]),
    ].filter(isSupabaseAuthCookieName);
    for (const name of authNames) {
      if (response.cookies.get(name)?.maxAge === 0) continue;
      response.cookies.set(name, '', { path: '/', sameSite: 'lax', maxAge: 0, ...(domain ? { domain } : {}) });
    }
    // Last: `cookies.set` rewrites all `Set-Cookie` headers and would drop these raw ones.
    if (domain) appendHostOnlyExpiries(response, authNames);

    return response;
  } catch (error) {
    console.error('Sign out error:', error);
    return NextResponse.json({ error: 'Sign out failed' }, { status: 500 });
  }
}
