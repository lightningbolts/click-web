import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { userMayAccessBusinessInsights } from '@/lib/server/businessInsightsEligibility';
import { isAdminUser } from '@/lib/server/adminRole';

const CONNECTIONS_RATE_LIMIT = 10;
const CONNECTIONS_RATE_WINDOW_MS = 60_000;
const READ_HEAVY_RATE_LIMIT = 60;
const READ_HEAVY_RATE_WINDOW_MS = 60_000;

const connectionsRequestTimestampsByIp = new Map<string, number[]>();
const readHeavyTimestampsByIp = new Map<string, number[]>();

const READ_HEAVY_API_PREFIXES = [
  '/api/beacons',
  '/api/map/beacons',
  '/api/hub/nearby',
  '/api/livekit/token',
] as const;

function isReadHeavyApiPath(pathname: string): boolean {
  return READ_HEAVY_API_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function slidingWindowRateLimitExceeded(
  ip: string,
  store: Map<string, number[]>,
  limit: number,
  windowMs: number,
): boolean {
  const now = Date.now();
  const windowStart = now - windowMs;
  let stamps = store.get(ip) ?? [];
  stamps = stamps.filter((t) => t > windowStart);
  if (stamps.length >= limit) {
    store.set(ip, stamps);
    return true;
  }
  stamps.push(now);
  store.set(ip, stamps);
  if (store.size > 50_000) {
    for (const [key, ts] of store) {
      const recent = ts.filter((t) => t > windowStart);
      if (recent.length === 0) store.delete(key);
      else store.set(key, recent);
    }
  }
  return false;
}

function connectionsRateLimitExceeded(ip: string): boolean {
  return slidingWindowRateLimitExceeded(
    ip,
    connectionsRequestTimestampsByIp,
    CONNECTIONS_RATE_LIMIT,
    CONNECTIONS_RATE_WINDOW_MS,
  );
}

function readHeavyRateLimitExceeded(ip: string): boolean {
  return slidingWindowRateLimitExceeded(
    ip,
    readHeavyTimestampsByIp,
    READ_HEAVY_RATE_LIMIT,
    READ_HEAVY_RATE_WINDOW_MS,
  );
}

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

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  // Dashboard loads use GET /api/connections twice per refresh (active + archived) plus Realtime-driven
  // refetches; implicit-flow auth is Bearer-based. Only throttle abuse-prone mutations.
  const connectionsMutation =
    isConnectionsApiPath(request.nextUrl.pathname) &&
    ['POST', 'PATCH', 'DELETE'].includes(request.method);
  if (connectionsMutation && connectionsRateLimitExceeded(getClientIp(request))) {
    return NextResponse.json(
      { error: 'Too many requests' },
      {
        status: 429,
        headers: {
          'Retry-After': '60',
        },
      },
    );
  }

  const pathname = request.nextUrl.pathname;
  const clientIp = getClientIp(request);
  if (
    pathname.startsWith('/api/') &&
    isReadHeavyApiPath(pathname) &&
    readHeavyRateLimitExceeded(clientIp)
  ) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': '60' } },
    );
  }
  // API routes authenticate in each Route Handler (`getSupabaseFromRouteRequest`, etc.). Running
  // `getUser()` here duplicates a network round-trip to Supabase Auth on every `/api/*` request and
  // dominated dev timing (see Next `proxy.ts` segment). Page navigations still refresh the session below.
  if (pathname.startsWith('/api/')) {
    return NextResponse.next({
      request: {
        headers: request.headers,
      },
    });
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
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set({ name, value, ...options });
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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const adminRoute = pathname === '/admin' || pathname.startsWith('/admin/');

  if (adminRoute) {
    if (!user || !isAdminUser(user)) {
      const redirect = NextResponse.redirect(new URL('/', request.url));
      supabaseResponse.cookies.getAll().forEach((c) => {
        redirect.cookies.set(c.name, c.value);
      });
      return redirect;
    }
  }

  if (pathname === '/insights' || pathname.startsWith('/insights/')) {
    const signupUrl = new URL('/business/signup', request.url);

    if (!user) {
      return supabaseResponse;
    }

    const allowed = await userMayAccessBusinessInsights(supabase, user);
    if (!allowed) {
      const redirect = NextResponse.redirect(signupUrl);
      supabaseResponse.cookies.getAll().forEach((c) => {
        redirect.cookies.set(c.name, c.value);
      });
      return redirect;
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};