'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { CheckCircle, X } from 'lucide-react';
import { fadePresence, fadeTransition, platePresence } from '@/lib/motion';
import { FcButton, FcField, FcInput } from '@/components/fc';

export type WaitlistSource = 'homepage_hero' | 'enterprise_landing';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function focusableIn(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(
    'button:not([disabled]), [href], input:not([disabled]), textarea, select, [tabindex]:not([tabindex="-1"])',
  )];
}

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
  const panelRef = useRef<HTMLDivElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (open) return;
    setStatus('idle');
    setMessage('');
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => emailRef.current?.focus(), 0);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !panelRef.current) return;
      const nodes = focusableIn(panelRef.current);
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose, status]);

  const submit = async () => {
    if (!EMAIL_PATTERN.test(email.trim())) {
      setStatus('error');
      setMessage('Enter a valid email address.');
      return;
    }
    setStatus('loading');
    try {
      const response = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), source }),
      });
      const data = await response.json();
      if (data.success) {
        setStatus('success');
        setMessage(data.message || "You're on the list. We'll email you when the app opens.");
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
        <motion.div
          key="waitlist-overlay"
          className="fixed inset-0 z-[100000] flex items-center justify-center bg-on-surface/40 px-4"
          {...(reduceMotion ? {} : fadePresence)}
          transition={fadeTransition(0.18)}
          onClick={onClose}
          role="presentation"
        >
          <motion.div
            ref={panelRef}
            {...(reduceMotion ? {} : platePresence)}
            transition={fadeTransition(0.32)}
            className="fc-card w-full max-w-md p-6"
            style={{ backgroundColor: 'var(--color-surface)' }}
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="waitlist-title"
            aria-describedby="waitlist-copy"
          >
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <h2 id="waitlist-title" className="text-2xl font-bold text-on-surface">
                  Join the Waitlist
                </h2>
                <p id="waitlist-copy" className="mt-2 text-sm leading-relaxed text-on-surface-variant">
                  We&apos;ll email you when the iOS and Android app opens. No ads. No feed. Built at
                  UW.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[8px] border border-border-hard text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface"
                aria-label="Close waitlist modal"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {status === 'success' ? (
              <div className="rounded-[16px] border border-border-hard bg-primary-container p-5 text-center">
                <CheckCircle className="mx-auto mb-3 h-10 w-10 text-primary" aria-hidden />
                <p className="font-medium text-on-primary-container">
                  You&apos;re on the list. We&apos;ll email you when the handshake app opens.
                </p>
                <FcButton className="mt-5 w-full" onClick={onClose}>
                  Done
                </FcButton>
              </div>
            ) : (
              <form
                className="space-y-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  void submit();
                }}
              >
                <FcField label="Email">
                  <FcInput
                    ref={emailRef}
                    id="waitlist-email"
                    type="email"
                    name="email"
                    autoComplete="email"
                    value={email}
                    onChange={(event) => {
                      setEmail(event.target.value);
                      if (status === 'error') {
                        setStatus('idle');
                        setMessage('');
                      }
                    }}
                    placeholder="you@example.com"
                    aria-invalid={status === 'error'}
                    aria-describedby={status === 'error' ? 'waitlist-email-error' : undefined}
                  />
                </FcField>
                {status === 'error' ? (
                  <p id="waitlist-email-error" className="text-sm text-error" role="alert">
                    {message}
                  </p>
                ) : null}
                <FcButton type="submit" disabled={status === 'loading'} className="w-full">
                  {status === 'loading' ? 'Joining…' : 'Join the Waitlist'}
                </FcButton>
              </form>
            )}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
