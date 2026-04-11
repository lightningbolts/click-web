'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { CheckCircle2, Loader2 } from 'lucide-react';

type VerificationStatus = 'loading' | 'success' | 'error';

/**
 * Client-side auth callback handler.
 *
 * Handles all Supabase email auth redirect formats:
 *  1. Error in query params  (?error=...&error_code=...)        → show error
 *  2. PKCE flow             (?code=...)                        → server route
 *  3. Token-hash flow       (?token_hash=...&type=...)         → server route
 *  4. Post-signup success   (?verified=signup)                 → success UI (session set by API)
 *
 * Note: `otp_expired` errors originate at Supabase's server before reaching
 * this page; they indicate the email link token expired/was already used.
 * Fix in Supabase dashboard: Auth → Settings → increase OTP Expiry (default
 * 3600 s). Also ensure the Site URL and Redirect URLs are set correctly.
 */
export default function AuthCallbackPage() {
  const router = useRouter();
  const [status, setStatus] = useState<VerificationStatus>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const handleCallback = async () => {
      const params = new URLSearchParams(window.location.search);

      // --- 0. Server already verified signup (redirect from /api/auth/callback) ---
      if (params.get('verified') === 'signup') {
        setStatus('success');
        return;
      }

      // --- 1. Check for errors in query params (Supabase sends these on token failure) ---
      const qError = params.get('error');
      const qErrorCode = params.get('error_code');
      const qErrorDesc = params.get('error_description');
      if (qError || qErrorCode) {
        const desc = qErrorDesc
          ? decodeURIComponent(qErrorDesc.replace(/\+/g, ' '))
          : 'Authentication failed. The link may have expired. Please request a new one.';
        setErrorMessage(desc);
        setStatus('error');
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

      setErrorMessage('No authentication data found. Please request a new link.');
      setStatus('error');
    };

    handleCallback();
  }, [router]);

  const pageShell = (children: ReactNode) => (
    <div className="min-h-[calc(100vh-1px)] relative flex items-center justify-center p-4 bg-[#121212] text-white overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_85%_55%_at_50%_-25%,rgba(131,56,236,0.14),transparent)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_40%_at_100%_100%,rgba(58,134,255,0.08),transparent)]"
        aria-hidden
      />
      <div className="relative z-10 w-full flex justify-center">{children}</div>
    </div>
  );

  if (status === 'loading') {
    return pageShell(
      <div className="glass max-w-md w-full p-10 rounded-3xl border border-zinc-800 ring-1 ring-white/5 text-center shadow-[0_0_60px_-12px_rgba(131,56,236,0.35)]">
        <div className="w-14 h-14 rounded-2xl bg-[#8338EC]/10 flex items-center justify-center mx-auto mb-5 border border-[#8338EC]/20">
          <Loader2 className="w-7 h-7 text-[#8338EC] animate-spin" aria-hidden />
        </div>
        <h2 className="text-xl font-bold mb-2">Authenticating…</h2>
        <p className="text-zinc-400 text-sm">Please wait while we verify your credentials.</p>
      </div>
    );
  }

  if (status === 'error' && errorMessage) {
    return pageShell(
      <div className="glass max-w-md w-full p-10 rounded-3xl border border-zinc-800 ring-1 ring-white/5 text-center">
        <div className="w-14 h-14 rounded-2xl bg-red-500/10 flex items-center justify-center mx-auto mb-5 border border-red-500/20">
          <svg className="w-7 h-7 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>
        <h2 className="text-xl font-bold mb-2">Authentication Error</h2>
        <p className="text-zinc-400 text-sm mb-8">{errorMessage}</p>
        <motion.a
          href="/"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="inline-block w-full sm:w-auto px-8 py-3 bg-[#8338EC] hover:bg-[#9d4eff] rounded-xl font-semibold transition-colors text-center"
        >
          Back to Home
        </motion.a>
      </div>
    );
  }

  if (status === 'success') {
    return pageShell(
      <div className="glass max-w-md w-full p-10 rounded-3xl border border-zinc-800 ring-1 ring-white/5 text-center shadow-[0_0_60px_-12px_rgba(131,56,236,0.4)]">
        <motion.div
          initial={{ scale: 0.85, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 320, damping: 22 }}
          className="mx-auto mb-6 flex justify-center"
        >
          <div className="relative">
            <div className="absolute inset-0 rounded-full bg-[#8338EC]/25 blur-xl scale-150" aria-hidden />
            <CheckCircle2
              className="relative w-20 h-20 text-[#8338EC]"
              strokeWidth={1.35}
              aria-hidden
            />
          </div>
        </motion.div>
        <h2 className="text-2xl md:text-3xl font-bold mb-3">Account Confirmed!</h2>
        <p className="text-zinc-400 text-sm leading-relaxed mb-8">
          Your email has been successfully verified. You can now close this tab and return to the app to sign in.
        </p>
        <motion.button
          type="button"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => router.push('/')}
          className="w-full py-3 bg-[#8338EC] hover:bg-[#9d4eff] rounded-xl font-semibold transition-colors"
        >
          Continue to Site
        </motion.button>
      </div>
    );
  }

  return null;
}
