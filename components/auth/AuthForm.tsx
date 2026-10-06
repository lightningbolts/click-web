'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ds/Button';
import { IconButton } from '@/components/ds/IconButton';
import { InlineNotice } from '@/components/ds/InlineNotice';
import { TextField } from '@/components/ds/TextField';
import { getSupabaseClient } from '@/lib/supabase';
import { startOAuth, type OAuthProvider } from '@/lib/auth/oauth';
import { safeNextPath } from '@/lib/shell/appNav';
import { AuthCard } from './AuthCard';

export { AuthCard };

export type AuthMode = 'login' | 'signup';

function isAtLeastYearsOld(isoDate: string, years: number): boolean {
  const d = new Date(`${isoDate}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return false;
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - years);
  return d <= cutoff;
}

function GoogleIcon() {
  return (
    <svg aria-hidden width="18" height="18" viewBox="0 0 18 18">
      <path fill="#4285F4" d="M17.64 9.2045c0-.6381-.0573-1.2518-.1636-1.8409H9v3.4814h4.8436c-.209 1.125-.8427 2.0782-1.7963 2.7166v2.2581h2.9087c1.7018-1.5668 2.6836-3.874 2.6836-6.6152z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.4673-.8059 5.9564-2.1804l-2.9087-2.2581c-.8059.54-1.8368.8591-3.0477.8591-2.344 0-4.3282-1.5832-5.0359-3.7104H.957v2.3318C2.4382 15.9832 5.4818 18 9 18z" />
      <path fill="#FBBC05" d="M3.9641 10.71c-.18-.54-.2822-1.1168-.2822-1.71s.1023-1.17.2822-1.71V4.9582H.957C.3477 6.1732 0 7.5468 0 9s.3477 2.8268.957 4.0418L3.9641 10.71z" />
      <path fill="#EA4335" d="M9 3.5795c1.3214 0 2.5077.4541 3.4405 1.346l2.5813-2.5814C13.4632.8918 11.4259 0 9 0 5.4818 0 2.4382 2.0168.957 4.9582L3.9641 7.29C4.6718 5.1627 6.656 3.5795 9 3.5795z" />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg aria-hidden width="16" height="18" viewBox="0 0 16 18" fill="currentColor">
      <path d="M13.35 9.58c-.02-2.02 1.65-2.99 1.73-3.04-.95-1.38-2.42-1.57-2.94-1.59-1.25-.13-2.44.74-3.07.74-.64 0-1.61-.72-2.65-.7-1.36.02-2.63.8-3.33 2.02-1.42 2.46-.36 6.1 1.02 8.09.67.97 1.47 2.06 2.52 2.02 1.02-.04 1.4-.66 2.63-.66s1.57.66 2.65.64c1.1-.02 1.79-.99 2.46-1.97.78-1.12 1.09-2.22 1.11-2.28-.02-.01-2.13-.82-2.15-3.27zM11.4 3.64c.56-.68.94-1.62.83-2.56-.81.03-1.79.54-2.37 1.22-.52.6-.98 1.56-.85 2.48.9.07 1.83-.46 2.39-1.14z" />
    </svg>
  );
}

/**
 * `/login` and `/signup` (spec §7.11). Linkable, `?next=` validated as a same-origin path,
 * errors inline above the submit button.
 */
export function AuthForm({ mode, next: rawNext }: { mode: AuthMode; next?: string | null }) {
  const router = useRouter();
  const next = safeNextPath(rawNext ?? null);
  const signup = mode === 'signup';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [birthday, setBirthday] = useState('');
  const [busy, setBusy] = useState<'email' | OAuthProvider | null>(null);
  const [error, setError] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);

  const switchHref = `${signup ? '/login' : '/signup'}${next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`;

  const onOAuth = async (provider: OAuthProvider) => {
    setError('');
    const supabase = getSupabaseClient();
    if (!supabase) return setError('Sign-in is not available right now.');
    setBusy(provider);
    try {
      const { error: oauthError } = await startOAuth(supabase, { provider, origin: window.location.origin, next });
      if (oauthError) {
        setError(oauthError);
        setBusy(null);
      }
    } catch {
      setError('Network error. Please try again.');
      setBusy(null);
    }
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    const supabase = getSupabaseClient();
    if (!supabase) return setError('Sign-in is not available right now.');

    if (signup) {
      const fn = firstName.trim();
      const ln = lastName.trim();
      if (!fn || !ln || !birthday) return setError('Enter your first name, last name and birthday.');
      if (!isAtLeastYearsOld(birthday, 13)) return setError('You must be at least 13 years old.');
    }

    setBusy('email');
    try {
      if (signup) {
        const display = `${firstName.trim()} ${lastName.trim()}`.trim();
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              first_name: firstName.trim(),
              last_name: lastName.trim(),
              birthday,
              full_name: display,
              name: display,
            },
            emailRedirectTo: `${window.location.origin}/api/auth/callback?next=${encodeURIComponent(next)}`,
          },
        });
        if (signUpError) {
          setError(
            /already registered|unique constraint/i.test(signUpError.message)
              ? 'An account with this email already exists.'
              : signUpError.message,
          );
        } else if (data.user?.identities && data.user.identities.length === 0) {
          setError('An account with this email already exists.');
        } else {
          setSentTo(email);
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) {
          setError(signInError.message);
        } else {
          router.replace(next);
          router.refresh();
          return;
        }
      }
    } catch {
      setError('Network error. Please try again.');
    }
    setBusy(null);
  };

  if (sentTo) {
    return (
      <AuthCard title="Check your email" subtitle={`We sent a verification link to ${sentTo}. Open it on this device to finish.`}>
        <Button href={switchHref} variant="secondary" size="lg" fullWidth>
          Back to log in
        </Button>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title={signup ? 'Join Click' : 'Welcome back'}
      subtitle="In-person first connections and private messaging."
    >
      <div className="flex flex-col gap-2.5">
        <Button
          variant="secondary"
          size="lg"
          fullWidth
          onClick={() => void onOAuth('google')}
          loading={busy === 'google'}
          disabled={busy !== null}
        >
          <GoogleIcon />
          Continue with Google
        </Button>
        <Button
          variant="secondary"
          size="lg"
          fullWidth
          onClick={() => void onOAuth('apple')}
          loading={busy === 'apple'}
          disabled={busy !== null}
        >
          <AppleIcon />
          Continue with Apple
        </Button>
      </div>

      <div className="type-meta my-5 flex items-center gap-3 text-fg-tertiary">
        <span className="h-px flex-1 bg-hairline" />
        or use email
        <span className="h-px flex-1 bg-hairline" />
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate={false}>
        {signup ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <TextField label="First name" value={firstName} onChange={(e) => setFirstName(e.target.value)} autoComplete="given-name" required />
              <TextField label="Last name" value={lastName} onChange={(e) => setLastName(e.target.value)} autoComplete="family-name" required />
            </div>
            <TextField
              label="Birthday"
              type="date"
              value={birthday}
              onChange={(e) => setBirthday(e.target.value)}
              autoComplete="bday"
              help="You must be at least 13."
              required
            />
          </>
        ) : null}
        <TextField
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          inputMode="email"
          required
        />
        <TextField
          label="Password"
          type={showPassword ? 'text' : 'password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={signup ? 'new-password' : 'current-password'}
          minLength={signup ? 8 : undefined}
          required
          trailing={
            <IconButton
              icon={showPassword ? EyeOff : Eye}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              aria-pressed={showPassword}
              size="sm"
              onClick={() => setShowPassword((v) => !v)}
            />
          }
        />
        {!signup ? (
          <Link href="/forgot-password" className="type-meta -mt-2 self-end font-semibold text-accent hover:underline">
            Forgot password?
          </Link>
        ) : null}

        {error ? (
          <InlineNotice variant="destructive" live>
            {error}
          </InlineNotice>
        ) : null}

        <Button type="submit" size="lg" fullWidth loading={busy === 'email'} disabled={busy !== null}>
          {signup ? 'Create account' : 'Log in'}
        </Button>
      </form>

      <p className="type-body mt-4 text-center text-fg-secondary">
        {signup ? 'Already on Click? ' : 'New to Click? '}
        <Link href={switchHref} className="font-semibold text-accent hover:underline">
          {signup ? 'Log in' : 'Create an account'}
        </Link>
      </p>
      <p className="type-meta mt-6 text-center text-fg-tertiary">
        By continuing you agree to the{' '}
        <Link href="/terms" className="underline hover:text-fg-secondary">
          Terms
        </Link>{' '}
        and{' '}
        <Link href="/privacy" className="underline hover:text-fg-secondary">
          Privacy Policy
        </Link>
        .
      </p>
    </AuthCard>
  );
}
