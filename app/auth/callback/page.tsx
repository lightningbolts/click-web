'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseClient } from '@/lib/supabase';

/**
 * Client-side auth callback handler.
 *
 * Handles all Supabase email auth redirect formats:
 *  1. Error in query params  (?error=...&error_code=...)        → show error
 *  2. PKCE flow             (?code=...)                        → server route
 *  3. Token-hash flow       (?token_hash=...&type=...)         → server route
 *  4. Legacy implicit flow  (#access_token=...&type=recovery)  → setSession
 *
 * Note: `otp_expired` errors originate at Supabase's server before reaching
 * this page — they indicate the email link token expired/was already used.
 * Fix in Supabase dashboard: Auth → Settings → increase OTP Expiry (default
 * 3600 s). Also ensure the Site URL and Redirect URLs are set correctly.
 */
export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleCallback = async () => {
      const supabase = getSupabaseClient();
      if (!supabase) {
        setError('Authentication is not available.');
        return;
      }

      const params = new URLSearchParams(window.location.search);

      // --- 1. Check for errors in query params (Supabase sends these on token failure) ---
      const qError = params.get('error');
      const qErrorCode = params.get('error_code');
      const qErrorDesc = params.get('error_description');
      if (qError || qErrorCode) {
        const desc = qErrorDesc
          ? decodeURIComponent(qErrorDesc.replace(/\+/g, ' '))
          : 'Authentication failed. The link may have expired — please request a new one.';
        setError(desc);
        return;
      }

      // --- 2. PKCE flow: `code` query param → delegate to server route ---
      const code = params.get('code');
      if (code) {
        const next = params.get('next') || '/dashboard';
        window.location.href = `/api/auth/callback?code=${encodeURIComponent(code)}&next=${encodeURIComponent(next)}`;
        return;
      }

      // --- 3. Token-hash flow (Supabase current default for email auth) ---
      // Supabase redirects with ?token_hash=XX&type=recovery|signup|magiclink
      const tokenHash = params.get('token_hash');
      const tokenType = params.get('type');
      if (tokenHash && tokenType) {
        window.location.href = `/api/auth/callback?token_hash=${encodeURIComponent(tokenHash)}&type=${encodeURIComponent(tokenType)}`;
        return;
      }

      // --- 4. Legacy implicit flow: hash fragment tokens ---
      const hash = window.location.hash;
      if (!hash || hash.length < 2) {
        // No tokens at all — user navigated here directly
        setError('No authentication data found. Please request a new link.');
        return;
      }

      const hashParams = new URLSearchParams(hash.substring(1));

      // Check for errors in the hash fragment
      const hashError = hashParams.get('error');
      const errorDescription = hashParams.get('error_description');
      if (hashError) {
        const desc = errorDescription
          ? decodeURIComponent(errorDescription.replace(/\+/g, ' '))
          : 'Authentication failed. The link may have expired — please request a new one.';
        setError(desc);
        return;
      }

      // Extract legacy implicit-flow tokens
      const accessToken = hashParams.get('access_token');
      const refreshToken = hashParams.get('refresh_token');
      const type = hashParams.get('type');

      if (accessToken && refreshToken) {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });

        if (sessionError) {
          console.error('Error setting session:', sessionError);
          setError(sessionError.message);
          return;
        }

        if (type === 'recovery') {
          router.replace('/reset-password');
        } else {
          const next = params.get('next') || '/dashboard';
          router.replace(next);
        }
      } else {
        setError('Invalid authentication link. Please request a new one.');
      }
    };

    handleCallback();
  }, [router]);

  // Loading / error UI
  return (
    <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center p-4">
      <div className="glass max-w-md w-full p-8 rounded-3xl border border-zinc-800 text-center">
        {error ? (
          <>
            <div className="w-12 h-12 rounded-2xl bg-red-500/10 flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold mb-2">Authentication Error</h2>
            <p className="text-zinc-400 mb-6">{error}</p>
            <a
              href="/"
              className="inline-block px-6 py-3 bg-[#8338EC] hover:bg-[#9d4eff] rounded-xl font-semibold transition-colors"
            >
              Back to Home
            </a>
          </>
        ) : (
          <>
            <div className="w-12 h-12 rounded-2xl bg-[#8338EC]/10 flex items-center justify-center mx-auto mb-4 animate-pulse">
              <svg className="w-6 h-6 text-[#8338EC]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold mb-2">Authenticating…</h2>
            <p className="text-zinc-400">Please wait while we verify your credentials.</p>
          </>
        )}
      </div>
    </div>
  );
}
