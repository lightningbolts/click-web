'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { CheckCircle2, Smartphone, Users } from 'lucide-react';
import { Button } from '@/components/ds/Button';
import { ClickMark } from '@/components/ds/ClickMark';
import { InlineNotice } from '@/components/ds/InlineNotice';
import { fieldClassName } from '@/components/ds/TextField';
import { TextLink } from '@/components/ds/TextLink';
import { APP_CONFIG } from '@/lib/config';
import { WAITLIST_EMAIL_ERROR, waitlistEmailSchema } from '@/lib/validation/waitlistEmail';

type Status = 'idle' | 'loading' | 'success' | 'error';

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 items-start justify-center px-[var(--gutter)] py-10 sm:items-center sm:py-16">
      <div className="w-full max-w-[400px] rounded-xl bg-surface p-6 text-center sm:p-8 dark:shadow-[inset_0_0_0_1px_var(--hairline)]">
        {children}
      </div>
    </div>
  );
}

/**
 * Where a Click QR scan lands. With the app launched it tries the `click://` deep link, then
 * offers the stores; before launch it's a waitlist signup credited to the person who shared.
 */
export default function ConnectPage() {
  const params = useParams();
  const userId = params.userId as string;
  const [attemptedDeepLink, setAttemptedDeepLink] = useState(false);
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!userId || !APP_CONFIG.app_launched) return;
    const timeout = setTimeout(() => setAttemptedDeepLink(true), 2500);
    window.location.href = `click://connect/${userId}`;
    return () => clearTimeout(timeout);
  }, [userId]);

  // Counts the scan for the person who shared (the result doesn't change this page).
  useEffect(() => {
    if (!userId) return;
    void fetch('/api/qr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetUserId: userId }),
    }).catch(() => undefined);
  }, [userId]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status === 'loading') return;
    const parsed = waitlistEmailSchema.safeParse(email);
    if (!parsed.success) {
      setStatus('error');
      setMessage(WAITLIST_EMAIL_ERROR);
      return;
    }
    setStatus('loading');
    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: parsed.data, source: 'deep_link', referrer_user_id: userId }),
      });
      const data = await res.json();
      if (data.success) {
        setStatus('success');
        setMessage(data.message);
      } else {
        setStatus('error');
        setMessage(data.error || 'Something went wrong. Try again.');
      }
    } catch {
      setStatus('error');
      setMessage('Network error. Please try again.');
    }
  };

  if (!userId) {
    return (
      <Shell>
        <h1 className="type-title-2 text-fg">This link isn’t valid</h1>
        <p className="type-body mt-2 text-fg-secondary">Ask for a new Click code.</p>
      </Shell>
    );
  }

  return (
    <Shell>
      <span className="mx-auto flex size-16 items-center justify-center rounded-full bg-selection text-accent">
        <Users size={28} strokeWidth={1.75} aria-hidden />
      </span>
      <h1 className="type-title-2 mt-5 text-fg">Connect on Click</h1>
      <p className="type-body mt-1.5 text-fg-secondary">Someone shared their Click with you.</p>

      {!APP_CONFIG.app_launched ? (
        <div className="mt-6 text-left">
          {status === 'success' ? (
            <InlineNotice variant="info" icon={CheckCircle2}>
              {message} We’ll email you when Click launches.
            </InlineNotice>
          ) : (
            <form noValidate onSubmit={onSubmit} className="flex flex-col gap-3">
              <p className="type-meta text-fg-secondary">Click is opening soon. Join the waitlist and you’ll be connected first.</p>
              <input
                type="email"
                aria-label="Email"
                autoComplete="email"
                aria-invalid={status === 'error'}
                aria-describedby={status === 'error' ? 'connect-waitlist-error' : undefined}
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (status === 'error') {
                    setStatus('idle');
                    setMessage('');
                  }
                }}
                placeholder="you@example.com"
                className={`${fieldClassName} h-11`}
                required
              />
              <Button type="submit" variant="primary" size="lg" fullWidth disabled={status === 'loading'}>
                {status === 'loading' ? 'Joining…' : 'Join the Waitlist'}
              </Button>
              {status === 'error' ? (
                <p id="connect-waitlist-error" role="alert" className="type-meta text-destructive">
                  {message}
                </p>
              ) : null}
            </form>
          )}
        </div>
      ) : attemptedDeepLink ? (
        <div className="mt-6 flex flex-col gap-2">
          <p className="type-meta mb-1 flex items-center justify-center gap-1.5 text-fg-secondary">
            <Smartphone size={16} aria-hidden />
            Don’t have the app yet?
          </p>
          <Button href={APP_CONFIG.ios_store_url} target="_blank" rel="noopener noreferrer" variant="primary" size="lg" fullWidth>
            Download for iPhone
          </Button>
          <Button href={APP_CONFIG.android_store_url} target="_blank" rel="noopener noreferrer" variant="secondary" size="lg" fullWidth>
            Download for Android
          </Button>
        </div>
      ) : (
        <div className="mt-6 flex flex-col items-center gap-3" role="status">
          <ClickMark size={44} className="animate-[ds-loader-pulse_850ms_ease-in-out_infinite_alternate]" />
          <p className="type-meta text-fg-secondary">Opening the Click app…</p>
        </div>
      )}

      <p className="type-meta mt-6 text-fg-tertiary">
        <TextLink href="/">Learn more about Click</TextLink>
      </p>
    </Shell>
  );
}
