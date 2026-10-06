'use client';

import { Suspense, useState, type FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { AuthCard } from '@/components/auth/AuthCard';
import { Button } from '@/components/ds/Button';
import { InlineNotice } from '@/components/ds/InlineNotice';
import { TextField } from '@/components/ds/TextField';
import { TextLink } from '@/components/ds/TextLink';
import { getSupabaseClient } from '@/lib/supabase';

function ForgotPasswordForm() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState(() => searchParams.get('email')?.trim() ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const address = email.trim();
    if (!address) return;
    const supabase = getSupabaseClient();
    if (!supabase) return setError('Sign-in isn’t available right now. Try again later.');
    setBusy(true);
    setError('');
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(address, {
        redirectTo: `${window.location.origin}/api/auth/callback?next=${encodeURIComponent('/reset-password')}`,
      });
      if (resetError) setError(resetError.message);
      else setSentTo(address);
    } catch {
      setError('Couldn’t reach Click. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  if (sentTo) {
    return (
      <AuthCard title="Check your email" subtitle={`We sent a link to ${sentTo}. It opens a page where you can set a new password.`}>
        <Button variant="secondary" size="lg" fullWidth href="/login">
          Back to log in
        </Button>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Reset your password" subtitle="Enter the email you use for Click and we’ll send you a link.">
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <TextField label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        {error ? <InlineNotice variant="destructive">{error}</InlineNotice> : null}
        <Button type="submit" variant="primary" size="lg" fullWidth loading={busy} disabled={!email.trim()}>
          Send reset link
        </Button>
      </form>
      <p className="type-meta mt-6 text-center text-fg-secondary">
        Remembered it? <TextLink href="/login">Log in</TextLink>
      </p>
    </AuthCard>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={<AuthCard title="Reset your password" />}>
      <ForgotPasswordForm />
    </Suspense>
  );
}
