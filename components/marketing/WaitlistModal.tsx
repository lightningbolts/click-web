'use client';

import { useRef, useState } from 'react';
import { CheckCircle } from 'lucide-react';
import { FcButton, FcField, FcInput } from '@/components/fc';
import { FcDialog } from '@/components/fc/FcDialog';
import { WAITLIST_EMAIL_ERROR, waitlistEmailSchema } from '@/lib/validation/waitlistEmail';

export type WaitlistSource = 'homepage_hero' | 'enterprise_landing' | 'top_bar';

export default function WaitlistModal({
  open,
  onClose,
  source,
}: {
  open: boolean;
  onClose: () => void;
  source: WaitlistSource;
}) {
  const emailRef = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  // Reset a finished or failed attempt when the dialog reopens, during render so the plate
  // never paints the previous state first (and never flips while its exit animation runs).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open && status !== 'loading') {
      setStatus('idle');
      setMessage('');
    }
  }

  const submit = async () => {
    if (status === 'loading') return;
    const parsedEmail = waitlistEmailSchema.safeParse(email);
    if (!parsedEmail.success) {
      setStatus('error');
      setMessage(WAITLIST_EMAIL_ERROR);
      emailRef.current?.focus();
      return;
    }
    setStatus('loading');
    try {
      const response = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: parsedEmail.data, source }),
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
    <FcDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title="Join the Waitlist"
      description={
        <>We&apos;ll email you when the iOS and Android app opens. No ads. No feed. Built at UW.</>
      }
      initialFocusRef={emailRef}
      testId="waitlist-modal"
    >
      {status === 'success' ? (
        <div className="rounded-[16px] border border-border-hard bg-primary-container p-5 text-center">
          <CheckCircle className="mx-auto mb-3 h-10 w-10 text-primary" aria-hidden />
          <p className="font-bold text-on-primary-container">You&apos;re on the list</p>
          <p role="status" className="mt-2 text-on-primary-container">
            {message}
          </p>
          <FcButton className="mt-5 w-full" onClick={onClose}>
            Done
          </FcButton>
        </div>
      ) : (
        <form
          noValidate
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
              required
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
    </FcDialog>
  );
}
