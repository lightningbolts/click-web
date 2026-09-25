'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { FcButton } from '@/components/fc';

export default function VerifyWaitlistEmail() {
  const token = useRef('');
  const initialized = useRef(false);
  const [status, setStatus] = useState<'initial' | 'ready' | 'loading' | 'success' | 'error'>('initial');
  const [message, setMessage] = useState('');
  const [canConfirm, setCanConfirm] = useState(false);

  useEffect(() => {
    // Strict Mode must not reread the URL after the first effect cleared it.
    if (initialized.current) return;
    initialized.current = true;
    token.current = new URLSearchParams(window.location.hash.slice(1)).get('token') ?? '';
    window.history.replaceState(null, '', window.location.pathname);
    if (/^[a-f0-9]{64}$/.test(token.current)) {
      setCanConfirm(true);
      setStatus('ready');
    }
    else {
      setStatus('error');
      setMessage('This confirmation link is missing or invalid. Please request a new email.');
    }
  }, []);

  async function confirm() {
    if (status === 'loading') return;
    setStatus('loading');
    try {
      const response = await fetch('/api/waitlist/verify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token.current }),
      });
      const data = await response.json();
      if (response.ok && data.verified === true) {
        token.current = '';
        setCanConfirm(false);
        setStatus('success');
      } else {
        if (response.status === 400) {
          token.current = '';
          setCanConfirm(false);
        }
        setStatus('error');
        setMessage(data.error || 'Unable to confirm your email. Please try again.');
      }
    } catch {
      setStatus('error');
      setMessage('Network error. Please try again.');
    }
  }

  return (
    <main className="mx-auto w-full max-w-lg px-4 py-16">
      <section className="fc-card space-y-5 p-6">
        <h1 className="text-2xl font-bold text-on-surface">
          {status === 'success' ? 'You’re on the waitlist' : 'Confirm your email'}
        </h1>
        {status === 'success' ? (
          <p role="status">Your email is verified. We’ll email you when Click opens.</p>
        ) : (
          <>
            <p>Confirm that you requested to join the Click waitlist.</p>
            {status === 'error' && <p role="alert" className="text-error">{message}</p>}
            {canConfirm && (
              <FcButton onClick={confirm} disabled={status === 'loading'}>
                {status === 'loading' ? 'Confirming…' : 'Confirm email'}
              </FcButton>
            )}
          </>
        )}
        <Link href="/" className="block font-medium text-primary underline">Back to Click</Link>
      </section>
    </main>
  );
}
