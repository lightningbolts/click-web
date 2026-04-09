import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { userMayAccessBusinessInsights } from '@/lib/server/businessInsightsEligibility';

const CONNECTIONS_RATE_LIMIT = 10;
const CONNECTIONS_RATE_WINDOW_MS = 60_000;

const connectionsRequestTimestampsByIp = new Map<string, number[]>();

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

function connectionsRateLimitExceeded(ip: string): boolean {
  const now = Date.now();
  const windowStart = now - CONNECTIONS_RATE_WINDOW_MS;
  let stamps = connectionsRequestTimestampsByIp.get(ip) ?? [];
  stamps = stamps.filter((t) => t > windowStart);
  if (stamps.length >= CONNECTIONS_RATE_LIMIT) {
    connectionsRequestTimestampsByIp.set(ip, stamps);
    return true;
  }
  stamps.push(now);
  connectionsRequestTimestampsByIp.set(ip, stamps);
  if (connectionsRequestTimestampsByIp.size > 50_000) {
    for (const [key, ts] of connectionsRequestTimestampsByIp) {
      const recent = ts.filter((t) => t > windowStart);
      if (recent.length === 0) connectionsRequestTimestampsByIp.delete(key);
      else connectionsRequestTimestampsByIp.set(key, recent);
    }
  }
  return false;
}

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
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

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        flowType: 'implicit',
      },
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
          });
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          });
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  if (pathname === '/insights' || pathname.startsWith('/insights/')) {
    const signupUrl = new URL('/business/signup', request.url);

    // Browser auth uses implicit flow + localStorage (see lib/supabase.ts). Middleware only
    // sees cookie-based sessions, so getUser() is often null even when the user is signed in.
    // Defer to client-side InsightsAccessGate + /api/user/insights-access (Bearer from client).
    if (!user) {
      return response;
    }

    const allowed = await userMayAccessBusinessInsights(supabase, user);
    if (!allowed) {
      const redirect = NextResponse.redirect(signupUrl);
      response.cookies.getAll().forEach((c) => {
        redirect.cookies.set(c.name, c.value);
      });
      return redirect;
    }
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
