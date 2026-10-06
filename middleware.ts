import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { userMayAccessBusinessInsights } from '@/lib/server/businessInsightsEligibility';
import { hasSupabaseAuthCookie } from '@/lib/auth/authCookie';
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

  const adminRoute = pathname === '/admin' || pathname.startsWith('/admin/');
  const insightsRoute = pathname === '/insights' || pathname.startsWith('/insights/');

  // Anonymous visitors have nothing to refresh or verify: no network, no Supabase client.
  if (!hasSupabaseAuthCookie(request.cookies.getAll().map((c) => c.name))) {
    return adminRoute ? NextResponse.redirect(new URL('/', request.url)) : supabaseResponse;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
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

  const withCookies = (redirect: NextResponse) => {
    supabaseResponse.cookies.getAll().forEach((c) => {
      redirect.cookies.set(c.name, c.value);
    });
    return redirect;
  };

  if (adminRoute) {
    const role = (claims?.app_metadata as { role?: unknown } | undefined)?.role;
    if (!claims || role !== 'admin') {
      return withCookies(NextResponse.redirect(new URL('/', request.url)));
    }
  }

  if (insightsRoute && claims?.sub) {
    const allowed = await userMayAccessBusinessInsights(supabase, {
      id: claims.sub,
      email: typeof claims.email === 'string' ? claims.email : undefined,
    });
    if (!allowed) {
      return withCookies(NextResponse.redirect(new URL('/business/signup', request.url)));
    }
  }

  return supabaseResponse;
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
    '/insights/:path*',
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
