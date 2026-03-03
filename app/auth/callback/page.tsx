'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseClient } from '@/lib/supabase';

/**
 * Client-side auth callback handler.
 *
 * Why this exists: When Supabase PKCE is NOT enabled, password-recovery and
 * magic-link emails redirect with tokens in the **URL hash fragment**
 * (e.g. #access_token=...&type=recovery). Hash fragments are never sent to
 * the server, so the existing server-side /api/auth/callback route cannot
 * read them. This client page runs in the browser, extracts the tokens from
 * `window.location.hash`, establishes the session, and redirects onward.
 *
 * When PKCE IS enabled Supabase uses a `code` query parameter instead, which
 * the server route handles fine. This page also handles that case as a
 * graceful fallback by redirecting to the server callback.
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

      // --- Check for query-param `code` (PKCE flow) ---
      // If present, delegate to the server route which can exchange it.
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');
      if (code) {
        // Forward to server callback to exchange the code and set cookies
        const next = params.get('next') || '/dashboard';
        window.location.href = `/api/auth/callback?code=${encodeURIComponent(code)}&next=${encodeURIComponent(next)}`;
        return;
      }

      // --- Check for hash-fragment tokens (implicit / token-hash flow) ---
      const hash = window.location.hash;
      if (!hash || hash.length < 2) {
        // No tokens at all — user navigated here directly
        setError('No authentication data found. Please request a new link.');
        return;
      }

      const hashParams = new URLSearchParams(hash.substring(1));

      // Check for Supabase error in the hash
      const hashError = hashParams.get('error');
      const errorDescription = hashParams.get('error_description');
      if (hashError) {
        const desc = errorDescription
          ? decodeURIComponent(errorDescription.replace(/\+/g, ' '))
          : 'Authentication failed.';
        setError(desc);
        return;
      }

      // Extract tokens
      const accessToken = hashParams.get('access_token');
      const refreshToken = hashParams.get('refresh_token');
      const type = hashParams.get('type');

      if (accessToken && refreshToken) {
        // Set the session using the tokens from the hash
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });

        if (sessionError) {
          console.error('Error setting session:', sessionError);
          setError(sessionError.message);
          return;
        }

        // Route based on the auth type
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
