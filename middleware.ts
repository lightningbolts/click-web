import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { hasSupabaseAuthCookie } from '@/lib/auth/authCookie';
import {
  appendHostOnlyExpiries,
  AUTH_COOKIE_CLEANUP_MARKER,
  authCookieDomainFor,
  hasConflictingAuthCookies,
  isSupabaseAuthCookieName,
  migrateAuthCookiesToDomain,
} from '@/lib/auth/cookieDomain';
import { isSignedInAppPath } from '@/lib/shell/appRoutes';
import { legacyTabRedirect } from '@/lib/shell/legacyTabRedirect';
import { BIZ_PLACE_COOKIE } from '@/lib/places/workspace';
import { shouldApplyReadHeavyRateLimit } from '@/lib/server/readHeavyRateLimit';
import {
  CONNECTIONS_RATE_LIMIT,
  CONNECTIONS_RATE_LIMIT_BINDING,
  CONNECTIONS_RATE_WINDOW_MS,
  isRateLimited,
  READ_HEAVY_RATE_LIMIT,
  READ_HEAVY_RATE_LIMIT_BINDING,
  READ_HEAVY_RATE_WINDOW_MS,
} from '@/lib/server/rateLimit';

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  const realIp = request.headers.get('x-real-ip')?.trim();
  if (realIp) return realIp;
  return 'unknown';
}

function isConnectionsApiPath(pathname: string): boolean {
  return pathname === '/api/connections' || pathname.startsWith('/api/connections/');
}

function tooManyRequests(): NextResponse {
  return NextResponse.json(
    { error: 'Too many requests', code: 'rate_limited' },
    { status: 429, headers: { 'Retry-After': '60' } },
  );
}

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const pathname = request.nextUrl.pathname;
  const clientIp = getClientIp(request);

  // Dashboard loads use GET /api/connections twice per refresh (active + archived) plus Realtime-driven
  // refetches; implicit-flow auth is Bearer-based. Only throttle abuse-prone mutations.
  const connectionsMutation =
    isConnectionsApiPath(pathname) &&
    ['POST', 'PATCH', 'DELETE'].includes(request.method);
  if (
    connectionsMutation &&
    (await isRateLimited({
      bindingName: CONNECTIONS_RATE_LIMIT_BINDING,
      key: `connections:${clientIp}`,
      limit: CONNECTIONS_RATE_LIMIT,
      windowMs: CONNECTIONS_RATE_WINDOW_MS,
    }))
  ) {
    return tooManyRequests();
  }

  if (
    shouldApplyReadHeavyRateLimit(pathname, request.method) &&
    (await isRateLimited({
      bindingName: READ_HEAVY_RATE_LIMIT_BINDING,
      key: `read-heavy:${clientIp}`,
      limit: READ_HEAVY_RATE_LIMIT,
      windowMs: READ_HEAVY_RATE_WINDOW_MS,
    }))
  ) {
    return tooManyRequests();
  }

  // API routes authenticate in each Route Handler (`requireUser` / `getSupabaseFromRouteRequest`).
  // The matcher only sends rate-limited API prefixes here.
  if (pathname.startsWith('/api/')) {
    return NextResponse.next({ request: { headers: request.headers } });
  }

  if (pathname === '/') {
    const legacy = legacyTabRedirect(request.nextUrl.searchParams);
    if (legacy) return NextResponse.redirect(new URL(legacy, request.url), 308);
  }

  const adminRoute = pathname === '/admin' || pathname.startsWith('/admin/');
  // Business needs a session, never payment (spec §9.3); onboarding is open to everyone.
  const businessRoute = (pathname === '/business' || pathname.startsWith('/business/')) && !pathname.startsWith('/business/get-started');
  const appRoute = isSignedInAppPath(pathname) || businessRoute;
  const toLogin = () => {
    const url = new URL('/login', request.url);
    url.searchParams.set('next', `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(url);
  };

  // Anonymous visitors have nothing to refresh or verify: no network, no Supabase client.
  if (!hasSupabaseAuthCookie(request.cookies.getAll().map((c) => c.name))) {
    if (adminRoute) return NextResponse.redirect(new URL('/', request.url));
    if (appRoute) return toLogin();
    return supabaseResponse;
  }

  // Read before Supabase runs: `request.cookies.set` below rewrites this header, and only the
  // original shows whether the browser sent an auth cookie twice (host-only + domain copy).
  const originalCookieHeader = request.headers.get('cookie');
  const cookieDomain = authCookieDomainFor(request.nextUrl.hostname);

  // Host-only and domain copies of the session that don't form one session (a name sent twice,
  // or whole and chunked at once): Supabase would merge chunks of both or read the stale one,
  // and could delete the good shared session as invalid. Delete the host-only family and
  // reload, so the session is read from the surviving domain cookies. GET/HEAD only — never
  // redirect a Server Action POST — and at most once a minute, so it can't loop.
  if (
    cookieDomain &&
    (request.method === 'GET' || request.method === 'HEAD') &&
    !request.cookies.has(AUTH_COOKIE_CLEANUP_MARKER) &&
    hasConflictingAuthCookies(originalCookieHeader)
  ) {
    const reload = NextResponse.redirect(request.nextUrl, 307);
    reload.cookies.set(AUTH_COOKIE_CLEANUP_MARKER, '1', { path: '/', httpOnly: true, sameSite: 'lax', maxAge: 60 });
    appendHostOnlyExpiries(reload, request.cookies.getAll().map((c) => c.name).filter(isSupabaseAuthCookieName));
    return reload;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: cookieDomain ? { domain: cookieDomain } : {},
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });

          supabaseResponse = NextResponse.next({
            request: {
              headers: request.headers,
            },
          });

          cookiesToSet.forEach(({ name, value, options }) => {
            supabaseResponse.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  // `getClaims()` verifies the access token locally against the project JWKS (asymmetric
  // keys) and only refreshes it when it has expired, so a signed-in page request no
  // longer pays an Auth round-trip (spec §11.4). It falls back to `getUser()` for
  // legacy symmetric-key projects.
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims ?? null;

  // Last step on every response from here: moves pre-existing host-only auth cookies onto the
  // shared domain. It appends raw `Set-Cookie` headers, which a later `cookies.set` would drop.
  const finish = (response: NextResponse) => {
    if (cookieDomain) {
      migrateAuthCookiesToDomain(
        response,
        request.cookies.getAll(),
        originalCookieHeader,
        cookieDomain,
        request.nextUrl.protocol === 'https:',
      );
    }
    return response;
  };

  // Copy whole cookies (options included): name + value alone would write a refreshed
  // session back as host-only.
  const withCookies = (redirect: NextResponse) => {
    supabaseResponse.cookies.getAll().forEach((c) => {
      redirect.cookies.set(c);
    });
    return finish(redirect);
  };

  if (appRoute && !claims) {
    return withCookies(toLogin());
  }

  if (adminRoute) {
    const role = (claims?.app_metadata as { role?: unknown } | undefined)?.role;
    if (!claims || role !== 'admin') {
      return withCookies(NextResponse.redirect(new URL('/', request.url)));
    }
  }

  // Remember the last workspace Place for `/business` (validated when read). Server Components
  // can't set cookies, so it's set here (spec §9.3).
  const workspace = /^\/business\/places\/([0-9a-f-]{36})(?:\/|$)/i.exec(pathname);
  if (workspace && claims) {
    supabaseResponse.cookies.set(BIZ_PLACE_COOKIE, workspace[1], {
      path: '/business',
      httpOnly: true,
      sameSite: 'lax',
      secure: request.nextUrl.protocol === 'https:',
      maxAge: 90 * 24 * 60 * 60,
    });
  }

  return finish(supabaseResponse);
}

/**
 * Narrow matcher (spec §11.4): only gated or signed-in surfaces refresh the session here,
 * plus the rate-limited API prefixes. Public pages (`/events`, `/e/*`, `/p/*`, `/c/*`,
 * marketing) never run middleware. `/` is included so a signed-in visitor's expired
 * token is refreshed before `app/page.tsx` decides landing vs Home; anonymous `/`
 * returns before creating a client.
 *
 * Stays `middleware.ts` (Edge) rather than Next 16 `proxy.ts`: `proxy` always runs on
 * Node.js, which @opennextjs/cloudflare rejects at build time.
 */
export const config = {
  matcher: [
    '/',
    '/admin/:path*',
    '/business/:path*',
    '/clicks/:path*',
    '/map/:path*',
    '/add/:path*',
    '/me/:path*',
    '/settings/:path*',
    '/activity/:path*',
    '/people/:path*',
    '/api/connections/:path*',
    '/api/beacons/:path*',
    '/api/map/beacons/:path*',
    '/api/hub/nearby/:path*',
    '/api/livekit/token/:path*',
    '/api/drops/:path*',
  ],
};
