import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { userMayAccessBusinessInsights } from '@/lib/server/businessInsightsEligibility';

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

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
