import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { userMayAccessBusinessInsights } from '@/lib/server/businessInsightsEligibility';
import { isAdminUser } from '@/lib/server/adminRole';
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
  // Running `getUser()` here duplicates a network round-trip on every `/api/*` request.
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
