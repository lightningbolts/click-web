'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AuthCard } from '@/components/auth/AuthCard';
import { Button } from '@/components/ds/Button';
import { InlineNotice } from '@/components/ds/InlineNotice';
import { LoaderBlock } from '@/components/ds/Loader';
import { TextField } from '@/components/ds/TextField';
import { getSupabaseClient } from '@/lib/supabase';

type PageState = 'checking' | 'form' | 'saving' | 'success' | 'error';
const PASSWORD_MIN = 6;

/** Set a new password from a recovery link (PKCE session or legacy token_hash). */
export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [state, setState] = useState<PageState>('checking');
  const [error, setError] = useState('');
  const [token, setToken] = useState<{ hash: string; type: string } | null>(null);

  useEffect(() => {
    const init = async () => {
      const params = new URLSearchParams(window.location.search);
      if (params.get('error') || params.get('error_code')) {
        const desc = params.get('error_description');
        setError(desc ? decodeURIComponent(desc.replace(/\+/g, ' ')) : 'This reset link is invalid or has expired.');
        return setState('error');
      }
      // Legacy links carry token_hash; it is verified when the new password is submitted.
      const hash = params.get('token_hash');
      if (hash) {
        setToken({ hash, type: params.get('type') ?? 'recovery' });
        return setState('form');
      }
      // PKCE: /api/auth/callback already exchanged the code and set the session.
      const session = (await getSupabaseClient()?.auth.getSession())?.data.session;
      if (session?.user) return setState('form');
      setError('This reset link is missing or has already been used.');
      setState('error');
    };
    void init();
  }, []);

  const onSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (password.length < PASSWORD_MIN) return setError(`Use at least ${PASSWORD_MIN} characters.`);
      if (password !== confirm) return setError('The passwords don’t match.');
      const supabase = getSupabaseClient();
      if (!supabase) return setError('Sign-in isn’t available right now. Try again later.');
      setError('');
      setState('saving');
      if (token) {
        const { error: verifyError } = await supabase.auth.verifyOtp({ token_hash: token.hash, type: token.type as 'recovery' });
        if (verifyError) {
          setError(/expired|invalid/i.test(verifyError.message) ? 'This reset link has expired. Ask for a new one.' : verifyError.message);
          return setState('error');
        }
      }
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(updateError.message);
        return setState('form');
      }
      setState('success');
    },
    [password, confirm, token],
  );

  if (state === 'checking') {
    return (
      <AuthCard title="Set a new password">
        <LoaderBlock size={28} />
      </AuthCard>
    );
  }
  if (state === 'error') {
    return (
      <AuthCard title="This link didn’t work" subtitle={error}>
        <Button variant="primary" size="lg" fullWidth href="/forgot-password">
          Send a new link
        </Button>
      </AuthCard>
    );
  }
  if (state === 'success') {
    return (
      <AuthCard title="Password changed" subtitle="You’re signed in with your new password.">
        <Button variant="primary" size="lg" fullWidth onClick={() => router.push('/')}>
          Continue
        </Button>
      </AuthCard>
    );
  }
  return (
    <AuthCard title="Set a new password" subtitle={`At least ${PASSWORD_MIN} characters.`}>
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <TextField label="New password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
        <TextField label="Confirm new password" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        {error ? <InlineNotice variant="destructive">{error}</InlineNotice> : null}
        <Button type="submit" variant="primary" size="lg" fullWidth loading={state === 'saving'} disabled={!password || !confirm}>
          Change password
        </Button>
      </form>
    </AuthCard>
  );
}
