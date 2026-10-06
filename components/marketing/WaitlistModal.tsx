'use client';

import { useRef, useState } from 'react';
import { CheckCircle } from 'lucide-react';
import { Button } from '@/components/ds/Button';
import { Dialog } from '@/components/ds/Dialog';
import { fieldClassName } from '@/components/ds/TextField';
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
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title="Join the Waitlist"
      description={
        <>We&apos;ll email you when the iOS and Android app opens. No ads. No feed. Built at UW.</>
      }
      initialFocusSelector="[data-autofocus]"
      testId="waitlist-modal"
    >
      {status === 'success' ? (
        <div className="rounded-[16px] border border-hairline bg-selection p-5 text-center">
          <CheckCircle className="mx-auto mb-3 h-10 w-10 text-accent" aria-hidden />
          <p className="font-bold text-accent">You&apos;re on the list</p>
          <p role="status" className="mt-2 text-accent">
            {message}
          </p>
          <Button variant="primary" className="mt-5 w-full" onClick={onClose}>
            Done
          </Button>
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
          <label className="flex w-full min-w-0 flex-col gap-1.5">
<span className="type-meta font-semibold text-fg-secondary">Email</span>
            <input className={`${fieldClassName} h-11`}
              ref={emailRef}
              data-autofocus
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
          </label>
          {status === 'error' ? (
            <p id="waitlist-email-error" className="text-sm text-destructive" role="alert">
              {message}
            </p>
          ) : null}
          <Button variant="primary" type="submit" disabled={status === 'loading'} className="w-full">
            {status === 'loading' ? 'Joining…' : 'Join the Waitlist'}
          </Button>
        </form>
      )}
    </Dialog>
  );
}
