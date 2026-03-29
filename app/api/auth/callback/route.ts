import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const tokenHash = requestUrl.searchParams.get('token_hash');
  const type = requestUrl.searchParams.get('type') as 'recovery' | 'signup' | 'magiclink' | null;
  const next = requestUrl.searchParams.get('next') || '/dashboard';

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        // Keep consistent with middleware.ts and the browser client.
        // Implicit flow tokens land in the hash fragment and cannot be
        // pre-consumed by URL-defence email scanners.
        flowType: 'implicit',
      },
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
    // PKCE flow (OAuth, magic link, password reset with PKCE enabled)
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error('Auth error exchanging code:', error);
      const isRecovery = next.includes('reset') || type === 'recovery';
      const errPath = isRecovery ? '/reset-password' : '/auth/callback';
      const errUrl = new URL(errPath, request.url);
      errUrl.searchParams.set('error', 'exchange_failed');
      errUrl.searchParams.set('error_description', error.message);
      return NextResponse.redirect(errUrl);
    }
  } else if (tokenHash && type) {
    // Token-hash flow (password recovery emails, email confirmation)
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (error) {
      console.error('Auth error verifying OTP:', error);
      // Recovery failures go to /reset-password so the user sees
      // a contextually correct "Link Expired" page with a retry CTA.
      const errPath = type === 'recovery' ? '/reset-password' : '/auth/callback';
      const errUrl = new URL(errPath, request.url);
      errUrl.searchParams.set('error', 'otp_failed');
      errUrl.searchParams.set('error_description', error.message);
      return NextResponse.redirect(errUrl);
    }
    // Always send password recovery to the reset page regardless of `next`
    if (type === 'recovery') {
      return NextResponse.redirect(new URL('/reset-password', request.url));
    }
    // Signup email confirmation: show themed success page instead of an abrupt dashboard redirect.
    if (type === 'signup') {
      return NextResponse.redirect(new URL('/auth/callback?verified=signup', request.url));
    }
    if (type === 'magiclink') {
      return NextResponse.redirect(new URL(next, request.url));
    }
  }

  // Redirect to the requested page after successful auth
  return NextResponse.redirect(new URL(next, request.url));
}
