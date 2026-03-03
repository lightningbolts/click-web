'use client';

import { useState, useEffect, useCallback } from 'react';
import { getSupabaseClient } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Lock } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// ARCHITECTURE NOTE — why this is structured this way
// ─────────────────────────────────────────────────────────────────────────────
// Corporate email security scanners (Proofpoint / urldefense, Mimecast, etc.)
// pre-fetch every link inside every email via HTTP GET to scan for malware.
// Because Supabase tokens are one-time-use, the scanner burns the token before
// the real user ever clicks.
//
// The ONLY scanner-proof approach:
//   1. The email template links to YOUR domain, not supabase.co/auth/v1/verify.
//      Template: {{ .SiteURL }}/reset-password?token_hash={{ .TokenHash }}&type=recovery
//   2. The page receives token_hash as a URL param and shows a password form.
//   3. verifyOtp() is called ONLY when the user submits the form (client-side JS).
//      Scanners do not execute JavaScript — they cannot trigger form submission.
//   4. After verifyOtp() succeeds, updateUser() is called immediately in the
//      same interaction, before the session can expire.
// ─────────────────────────────────────────────────────────────────────────────

type PageState = 'form' | 'loading' | 'success' | 'error';

export default function ResetPassword() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pageState, setPageState] = useState<PageState>('form');
  const [error, setError] = useState('');

  // The token_hash and type come from the Supabase email template:
  //   {{ .SiteURL }}/reset-password?token_hash={{ .TokenHash }}&type=recovery
  const [tokenHash, setTokenHash] = useState<string | null>(null);
  const [tokenType, setTokenType] = useState<string>('recovery');

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const searchParams = new URLSearchParams(window.location.search);

    // ── Error params: Supabase redirects here with ?error= on failure ──
    const qError = searchParams.get('error');
    const qErrCode = searchParams.get('error_code');
    const qErrDesc = searchParams.get('error_description');

    // Also check hash (Supabase puts errors in hash with implicit flow)
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const hError = hashParams.get('error');
    const hErrCode = hashParams.get('error_code');
    const hErrDesc = hashParams.get('error_description');

    const anyError = qError || qErrCode || hError || hErrCode;
    const errDesc = qErrDesc || hErrDesc;

    if (anyError) {
      const msg = errDesc
        ? decodeURIComponent(errDesc.replace(/\+/g, ' '))
        : 'This reset link is invalid or has expired.';
      setError(msg);
      setPageState('error');
      return;
    }

    // ── Happy path: extract token_hash and type ──
    const hash = searchParams.get('token_hash');
    const type = searchParams.get('type') ?? 'recovery';

    if (hash) {
      setTokenHash(hash);
      setTokenType(type);
    } else {
      // No token_hash — the user landed here without a valid link
      setError('No reset token found. Please request a new password reset link.');
      setPageState('error');
    }
  }, []);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setError('');
    setPageState('loading');

    const supabase = getSupabaseClient();
    if (!supabase) {
      setError('Authentication is not available. Please try again.');
      setPageState('form');
      return;
    }

    if (!tokenHash) {
      setError('Reset token is missing. Please request a new link.');
      setPageState('error');
      return;
    }

    // ── Step 1: Exchange the token_hash for a session ──
    // This is the ONLY place verifyOtp is called — inside a form submit handler.
    // It runs in the user's browser via JavaScript. Email scanners making HTTP
    // GET requests to the page URL never reach this code path.
    const { error: verifyError } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: tokenType as 'recovery',
    });

    if (verifyError) {
      const expired =
        verifyError.message.toLowerCase().includes('expired') ||
        verifyError.message.toLowerCase().includes('invalid');
      setError(
        expired
          ? 'This reset link has expired. Please request a new one from the login page.'
          : verifyError.message
      );
      setPageState('error');
      return;
    }

    // ── Step 2: Update the password using the freshly established session ──
    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      setError(updateError.message);
      setPageState('form');
      return;
    }

    setPageState('success');
    setTimeout(() => router.push('/dashboard'), 2000);
  }, [password, confirmPassword, tokenHash, tokenType, router]);

  // ── Error / expired state ──
  if (pageState === 'error') {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass max-w-md w-full p-8 rounded-3xl border border-zinc-800 text-center"
        >
          <div className="w-12 h-12 rounded-2xl bg-red-500/10 flex items-center justify-center mx-auto mb-6">
            <Lock className="w-6 h-6 text-red-400" />
          </div>
          <h2 className="text-3xl font-bold mb-2">Link Expired</h2>
          <p className="text-zinc-400 mb-6">
            {error || 'This password reset link is invalid or has expired.'}
          </p>
          <p className="text-zinc-500 text-sm mb-8">
            Please request a new password reset link from the login page.
          </p>
          <a
            href="/"
            className="inline-block px-6 py-3 bg-[#8338EC] hover:bg-[#9d4eff] rounded-xl font-semibold transition-colors"
          >
            Back to Home
          </a>
        </motion.div>
      </div>
    );
  }

  // ── Success state ──
  if (pageState === 'success') {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass max-w-md w-full p-8 rounded-3xl border border-zinc-800 text-center"
        >
          <div className="w-12 h-12 rounded-2xl bg-green-500/10 flex items-center justify-center mx-auto mb-6">
            <Lock className="w-6 h-6 text-green-400" />
          </div>
          <h2 className="text-3xl font-bold mb-2">Password Updated</h2>
          <p className="text-zinc-400">Redirecting you to your dashboard…</p>
        </motion.div>
      </div>
    );
  }

  // ── Password form (default state + loading state) ──
  return (
    <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass max-w-md w-full p-8 rounded-3xl border border-zinc-800"
      >
        <div className="flex items-center justify-center mb-6">
          <div className="w-12 h-12 rounded-2xl bg-[#8338EC]/10 flex items-center justify-center">
            <Lock className="w-6 h-6 text-[#8338EC]" />
          </div>
        </div>

        <h2 className="text-3xl font-bold mb-2 text-center">Set New Password</h2>
        <p className="text-zinc-400 mb-8 text-center">Enter your new password below.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="password" className="block text-sm font-medium mb-2">
              New Password
            </label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              disabled={pageState === 'loading'}
              className="w-full px-4 py-3 bg-zinc-900/50 border border-zinc-700 rounded-xl focus:outline-none focus:border-[#8338EC] transition-colors disabled:opacity-50"
              placeholder="••••••••"
            />
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium mb-2">
              Confirm New Password
            </label>
            <input
              type="password"
              id="confirmPassword"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={6}
              disabled={pageState === 'loading'}
              className="w-full px-4 py-3 bg-zinc-900/50 border border-zinc-700 rounded-xl focus:outline-none focus:border-[#8338EC] transition-colors disabled:opacity-50"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
              {error}
            </div>
          )}

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            type="submit"
            disabled={pageState === 'loading'}
            className="w-full py-3 bg-[#8338EC] hover:bg-[#9d4eff] rounded-xl font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {pageState === 'loading' ? 'Updating…' : 'Update Password'}
          </motion.button>
        </form>
      </motion.div>
    </div>
  );
}
