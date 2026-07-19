'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { getSupabaseClient } from '@/lib/supabase';
import {
  createStripeCheckoutSession,
  createVenueForCheckout,
} from '@/app/business/actions';

type Step = 'account' | 'venue' | 'pay';

export function BusinessSignupFlow() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const checkout = searchParams.get('checkout');

  const [step, setStep] = useState<Step>('account');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSignupMode, setIsSignupMode] = useState(true);
  const [venueName, setVenueName] = useState('');
  const [venueLocation, setVenueLocation] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setStep('venue');
      }
    });
  }, []);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const supabase = getSupabaseClient();
    if (!supabase) {
      setError('Authentication is not available.');
      setLoading(false);
      return;
    }

    try {
      if (isSignupMode) {
        if (password !== confirmPassword) {
          setError('Passwords do not match.');
          setLoading(false);
          return;
        }
        const { data: signData, error: signErr } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/api/auth/callback`,
          },
        });
        if (signErr) {
          setError(signErr.message);
          setLoading(false);
          return;
        }
        if (signData.user && !signData.session) {
          setError(
            'Check your email to confirm your account, then return here and sign in to continue.',
          );
          setLoading(false);
          return;
        }
        setError('');
        setStep('venue');
      } else {
        const { error: signInErr } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInErr) {
          setError(signInErr.message);
          setLoading(false);
          return;
        }
        setStep('venue');
      }
    } catch {
      setError('Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleVenueAndCheckout = useCallback(async () => {
    setError('');
    setLoading(true);
    const supabase = getSupabaseClient();
    if (!supabase) {
      setError('Authentication is not available.');
      setLoading(false);
      return;
    }
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setError('Your session expired. Sign in again.');
        setLoading(false);
        return;
      }
      const venueResult = await createVenueForCheckout(
        session.access_token,
        venueName,
        venueLocation,
      );
      if (!venueResult.ok) {
        setError(venueResult.error);
        setLoading(false);
        return;
      }
      const sessionResult = await createStripeCheckoutSession(
        session.access_token,
        venueResult.data.venueId,
      );
      if (!sessionResult.ok) {
        setError(sessionResult.error);
        setLoading(false);
        return;
      }
      window.location.href = sessionResult.data.url;
    } catch {
      setError('Could not start checkout.');
      setLoading(false);
    }
  }, [venueName, venueLocation]);

  const onVenueSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!venueName.trim()) {
      setError('Venue name is required.');
      return;
    }
    void handleVenueAndCheckout();
  };

  if (checkout === 'success') {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center gap-6 px-6 text-center max-w-lg mx-auto">
        <div className="rounded-full bg-emerald-500/20 p-4">
          <span className="text-3xl" aria-hidden>
            ✓
          </span>
        </div>
        <h1 className="text-2xl font-semibold text-on-surface">You&apos;re subscribed</h1>
        <p className="text-on-surface-variant text-sm">
          Stripe is updating your account. If the dashboard does not open immediately, wait a few seconds
          and try again.
        </p>
        <Link
          href="/insights"
          className="inline-flex items-center justify-center rounded-xl bg-[#630ed4] px-6 py-3 text-sm font-medium text-on-surface hover:bg-[#630ed4]/90 transition-colors"
        >
          Go to Click Insights
        </Link>
        <button
          type="button"
          onClick={() => router.replace('/business/signup')}
          className="text-sm text-zinc-500 hover:text-zinc-300 underline"
        >
          Back to signup
        </button>
      </div>
    );
  }

  if (checkout === 'canceled') {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center gap-4 px-6 text-center max-w-md mx-auto">
        <h1 className="text-xl font-semibold text-on-surface">Checkout canceled</h1>
        <p className="text-on-surface-variant text-sm">You can return when you&apos;re ready to subscribe.</p>
        <button
          type="button"
          onClick={() => router.replace('/business/signup')}
          className="rounded-xl bg-white/10 px-5 py-2.5 text-sm text-on-surface hover:bg-white/15"
        >
          Continue setup
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-semibold text-on-surface">Business onboarding</h1>
          <p className="text-on-surface-variant text-sm">
            Create an account, add your venue, then subscribe to unlock Click Insights with micro-community analytics, Vibe Radar
            demand signals, and Pop-Up Beacon tools where your plan includes them.
          </p>
        </div>

        <div className="flex gap-2 justify-center text-xs text-zinc-500">
          <span className={step === 'account' ? 'text-[#630ed4]' : ''}>1. Account</span>
          <span>→</span>
          <span className={step === 'venue' ? 'text-[#630ed4]' : ''}>2. Venue &amp; pay</span>
        </div>

        {step === 'account' && (
          <form onSubmit={handleAuth} className="space-y-4">
            <div className="flex gap-2 rounded-xl bg-surface p-1 border border-border-hard">
              <button
                type="button"
                onClick={() => setIsSignupMode(true)}
                className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
                  isSignupMode ? 'bg-[#630ed4] text-on-surface' : 'text-on-surface-variant'
                }`}
              >
                Create account
              </button>
              <button
                type="button"
                onClick={() => setIsSignupMode(false)}
                className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
                  !isSignupMode ? 'bg-[#630ed4] text-on-surface' : 'text-on-surface-variant'
                }`}
              >
                Sign in
              </button>
            </div>
            <div>
              <label htmlFor="b-email" className="block text-xs text-zinc-500 mb-1">
                Email
              </label>
              <input
                id="b-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-border-hard bg-surface px-4 py-3 text-on-surface placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-[#630ed4]/50"
                placeholder="you@venue.com"
              />
            </div>
            <div>
              <label htmlFor="b-password" className="block text-xs text-zinc-500 mb-1">
                Password
              </label>
              <input
                id="b-password"
                type="password"
                autoComplete={isSignupMode ? 'new-password' : 'current-password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-border-hard bg-surface px-4 py-3 text-on-surface placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-[#630ed4]/50"
              />
            </div>
            {isSignupMode && (
              <div>
                <label htmlFor="b-confirm" className="block text-xs text-zinc-500 mb-1">
                  Confirm password
                </label>
                <input
                  id="b-confirm"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full rounded-xl border border-border-hard bg-surface px-4 py-3 text-on-surface placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-[#630ed4]/50"
                />
              </div>
            )}
            {error && <p className="text-sm text-red-700 dark:text-red-400">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-[#630ed4] py-3 text-sm font-medium text-on-surface hover:bg-[#630ed4]/90 disabled:opacity-50"
            >
              {loading ? 'Please wait…' : isSignupMode ? 'Continue' : 'Sign in'}
            </button>
          </form>
        )}

        {step === 'venue' && (
          <form onSubmit={onVenueSubmit} className="space-y-4">
            <div>
              <label htmlFor="v-name" className="block text-xs text-zinc-500 mb-1">
                Venue name
              </label>
              <input
                id="v-name"
                type="text"
                required
                value={venueName}
                onChange={(e) => setVenueName(e.target.value)}
                className="w-full rounded-xl border border-border-hard bg-surface px-4 py-3 text-on-surface placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-[#630ed4]/50"
                placeholder="e.g. The Rooftop"
              />
            </div>
            <div>
              <label htmlFor="v-loc" className="block text-xs text-zinc-500 mb-1">
                Location
              </label>
              <textarea
                id="v-loc"
                rows={3}
                value={venueLocation}
                onChange={(e) => setVenueLocation(e.target.value)}
                className="w-full resize-none rounded-xl border border-border-hard bg-surface px-4 py-3 text-on-surface placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-[#630ed4]/50"
                placeholder="City, neighborhood, or address"
              />
            </div>
            {error && <p className="text-sm text-red-700 dark:text-red-400">{error}</p>}
            <p className="text-xs text-zinc-500">
              Next, you&apos;ll complete payment on Stripe. Your subscription activates Click Insights for
              this venue.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setStep('account')}
                className="flex-1 rounded-xl border border-white/15 py-3 text-sm text-zinc-300 hover:bg-surface"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-[2] rounded-xl bg-[#630ed4] py-3 text-sm font-medium text-on-surface hover:bg-[#630ed4]/90 disabled:opacity-50"
              >
                {loading ? 'Redirecting…' : 'Continue to Stripe'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
