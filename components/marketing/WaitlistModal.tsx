'use client';

import { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { CheckCircle, X } from 'lucide-react';
import { fadePresence, fadeTransition } from '@/lib/motion';

export type WaitlistSource = 'homepage_hero' | 'enterprise_landing';

export default function WaitlistModal({
  open,
  onClose,
  source,
}: {
  open: boolean;
  onClose: () => void;
  source: WaitlistSource;
}) {
  const reduceMotion = useReducedMotion();
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const submit = async () => {
    if (!email.includes('@')) {
      setStatus('error');
      setMessage('Enter a valid email address.');
      return;
    }
    setStatus('loading');
    try {
      const response = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, source }),
      });
      const data = await response.json();
      if (data.success) {
        setStatus('success');
        setMessage(data.message || "You're on the list! We'll be in touch.");
        return;
      }
      setStatus('error');
      setMessage(data.error || 'Something went wrong.');
    } catch {
      setStatus('error');
      setMessage('Network error. Please try again.');
    }
  };

  return (
    <AnimatePresence>
      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-on-surface/40 px-4"
          onClick={onClose}
          role="presentation"
        >
          <motion.div
            {...(reduceMotion ? {} : fadePresence)}
            transition={fadeTransition(0.2)}
            className="fc-card w-full max-w-md p-6"
            style={{ backgroundColor: 'var(--color-surface)' }}
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="waitlist-title"
          >
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <h2 id="waitlist-title" className="text-2xl font-bold text-on-surface">
                  Join the Waitlist
                </h2>
                <p className="mt-2 text-sm text-on-surface-variant">
                  Leave your email and we&apos;ll reach out when we&apos;re ready.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-border-hard p-2 text-on-surface-variant hover:text-on-surface"
                aria-label="Close waitlist modal"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {status === 'success' ? (
              <div className="rounded-[16px] border border-border-hard bg-secondary-container p-5 text-center">
                <CheckCircle className="mx-auto mb-3 h-10 w-10 text-secondary" />
                <p className="font-medium text-on-secondary-container">You&apos;re on the list. We&apos;ll be in touch.</p>
                <p className="mt-2 text-sm text-on-surface-variant">{message}</p>
              </div>
            ) : (
              <div className="space-y-4">
                <input
                  type="email"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    if (status === 'error') {
                      setStatus('idle');
                      setMessage('');
                    }
                  }}
                  placeholder="you@example.com"
                  className="fc-input w-full px-4 py-3"
                />
                {status === 'error' ? (
                  <p className="text-sm text-error">{message}</p>
                ) : null}
                <button
                  type="button"
                  onClick={() => void submit()}
                  disabled={status === 'loading'}
                  className="fc-btn-primary w-full px-4 py-3 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {status === 'loading' ? 'Joining…' : 'Submit'}
                </button>
              </div>
            )}
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}
