import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

type OtpType = 'recovery' | 'signup' | 'magiclink';

function normalizeNextPath(candidate: string | null): string {
  if (!candidate || !candidate.startsWith('/')) {
    return '/dashboard';
  }
  if (candidate.startsWith('//')) {
    return '/dashboard';
  }
  return candidate;
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const tokenHash = request.nextUrl.searchParams.get('token_hash');
  const type = request.nextUrl.searchParams.get('type') as OtpType | null;
  const nextPath = normalizeNextPath(request.nextUrl.searchParams.get('next'));

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Safe to ignore from Server Components — middleware handles refresh.
          }
        },
      },
    }
  );

  if (code) {
    // PKCE flow: exchange code for a cookie-backed session and redirect to a clean URL.
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error('Auth error exchanging code:', error);
      const isRecovery = nextPath.includes('reset') || type === 'recovery';
      const errPath = isRecovery ? '/reset-password' : '/auth/callback';
      const errUrl = request.nextUrl.clone();
      errUrl.pathname = errPath;
      errUrl.search = '';
      errUrl.searchParams.set('error', 'exchange_failed');
      errUrl.searchParams.set('error_description', error.message);
      return NextResponse.redirect(errUrl);
    }

    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = nextPath;
    redirectUrl.search = '';
    return NextResponse.redirect(redirectUrl);
  } else if (tokenHash && type) {
    // Token-hash fallback flow for older links and compatibility.
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (error) {
      console.error('Auth error verifying OTP:', error);
      const errPath = type === 'recovery' ? '/reset-password' : '/auth/callback';
      const errUrl = request.nextUrl.clone();
      errUrl.pathname = errPath;
      errUrl.search = '';
      errUrl.searchParams.set('error', 'otp_failed');
      errUrl.searchParams.set('error_description', error.message);
      return NextResponse.redirect(errUrl);
    }

    if (type === 'recovery') {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = '/reset-password';
      redirectUrl.search = '';
      return NextResponse.redirect(redirectUrl);
    }

    if (type === 'signup') {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = '/auth/callback';
      redirectUrl.search = '';
      redirectUrl.searchParams.set('verified', 'signup');
      return NextResponse.redirect(redirectUrl);
    }

    if (type === 'magiclink') {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = nextPath;
      redirectUrl.search = '';
      return NextResponse.redirect(redirectUrl);
    }
  }

  const redirectUrl = request.nextUrl.clone();
  redirectUrl.pathname = nextPath;
  redirectUrl.search = '';
  return NextResponse.redirect(redirectUrl);
}
