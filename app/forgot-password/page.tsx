'use client';

import { FormEvent, useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { getSupabaseClient } from '@/lib/supabase';

function ForgotPasswordForm() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    const prefill = searchParams.get('email');
    if (prefill && prefill.trim()) {
      setEmail(prefill.trim());
    }
  }, [searchParams]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    setSuccess('');

    try {
      const supabase = getSupabaseClient();
      if (!supabase) {
        setError('Authentication is not available');
        setIsLoading(false);
        return;
      }

      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/api/auth/callback?next=${encodeURIComponent('/reset-password')}`,
      });

      if (resetError) {
        setError(resetError.message);
      } else {
        setSuccess('Password reset link sent! Check your email.');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-on-surface flex items-center justify-center p-4">
      <div className="fc-card w-full max-w-md rounded-[16px] border-2 border-border-hard bg-surface p-8">
        <p className="mb-1 text-sm font-semibold uppercase tracking-wider text-primary">Click</p>
        <h1 className="mb-2 text-3xl font-bold tracking-tight">Forgot password</h1>
        <p className="mb-8 text-on-surface-variant">
          Enter your account email and we&apos;ll send a link to set a new password.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="mb-2 block text-sm font-medium">
              Email
            </label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              autoFocus
              disabled={isLoading || Boolean(success)}
              className="fc-input w-full px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
              placeholder="you@example.com"
            />
          </div>

          {error && (
            <div className="rounded-[8px] border-2 border-error bg-surface px-3 py-2 text-sm text-error">
              {error}
            </div>
          )}

          {success && (
            <div className="rounded-[8px] border-2 border-border-hard bg-surface-container px-3 py-2 text-sm text-on-surface">
              {success}
            </div>
          )}

          {!success && (
            <button
              type="submit"
              disabled={isLoading || !email.trim()}
              className="fc-btn-primary w-full py-3 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isLoading ? 'Sending…' : 'Send reset link'}
            </button>
          )}
        </form>

        <p className="mt-8 text-center text-sm text-on-surface-variant">
          Remembered it?{' '}
          <Link href="/" className="font-semibold text-primary underline-offset-2 hover:underline">
            Back to home
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-background text-on-surface flex items-center justify-center p-4">
          <div className="fc-card w-full max-w-md rounded-[16px] border-2 border-border-hard bg-surface p-8">
            <p className="text-on-surface-variant">Loading…</p>
          </div>
        </div>
      }
    >
      <ForgotPasswordForm />
    </Suspense>
  );
}
