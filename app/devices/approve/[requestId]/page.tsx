'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useParams } from 'next/navigation';
import { CheckCircle2, ShieldQuestion, XCircle } from 'lucide-react';
import { Button } from '@/components/ds/Button';
import { Spinner } from '@/components/ds/Spinner';
import { cn } from '@/lib/cn';
import { shareWebE2eeV2HistoryWithApprovedDevices } from '@/lib/chat/e2eeV2Client';

/**
 * Landing page for the "new device signed in" magic-link email. Supabase appends the new session
 * to the URL fragment (implicit flow); the page reads it, shows the request and lets the user
 * approve or deny sharing chat history with the new device. The fragment is cleared immediately
 * so the tokens don't stay in history or get shared with the URL.
 */

type HistoryRequest = {
  id: string;
  status: 'pending' | 'approved' | 'denied';
  created_at: string;
  expires_at: string;
  device_registered_at: string | null;
  expired: boolean;
};

type View =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; request: HistoryRequest }
  | { kind: 'saving'; request: HistoryRequest }
  | { kind: 'done'; request: HistoryRequest };

function readFragmentSession(): { accessToken: string | null; error: string | null } {
  const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const error = fragment.get('error_description') ?? fragment.get('error');
  const accessToken = fragment.get('access_token');
  if (window.location.hash) {
    window.history.replaceState(null, '', window.location.pathname);
  }
  return { accessToken, error: error ? error.replace(/\+/g, ' ') : null };
}

function formatWhen(iso: string | null): string {
  if (!iso) return 'recently';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? 'recently' : date.toLocaleString();
}

export default function ApproveDevicePage() {
  const params = useParams<{ requestId: string }>();
  const requestId = params?.requestId ?? '';
  const [view, setView] = useState<View>({ kind: 'loading' });
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const { accessToken, error } = readFragmentSession();
    if (error) {
      setView({ kind: 'error', message: `${error}. Sign in on your new device again to get a fresh email.` });
      return;
    }
    if (!accessToken) {
      setView({ kind: 'error', message: 'Open this page from the link in your email.' });
      return;
    }
    setToken(accessToken);
    fetch(`/api/chat/devices/history-requests/${encodeURIComponent(requestId)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error ?? 'This request could not be found.');
        const request = body.request as HistoryRequest;
        setView(request.status === 'pending' && !request.expired ? { kind: 'ready', request } : { kind: 'done', request });
      })
      .catch((err: unknown) => {
        setView({ kind: 'error', message: err instanceof Error ? err.message : 'Something went wrong.' });
      });
  }, [requestId]);

  const decide = async (decision: 'approve' | 'deny') => {
    if (view.kind !== 'ready' || !token) return;
    setView({ kind: 'saving', request: view.request });
    try {
      const response = await fetch(`/api/chat/devices/history-requests/${encodeURIComponent(requestId)}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? 'Could not save your decision.');
      const decided = body.request as HistoryRequest;
      if (decision === 'approve') {
        // If this browser already holds historical epoch keys, finish the transfer now instead
        // of waiting for a later app focus/poll. Approval remains successful if this browser has
        // no old keys; another established device can still backfill them when it next opens.
        await shareWebE2eeV2HistoryWithApprovedDevices({
          getAuthHeaders: async () => ({ Authorization: `Bearer ${token}` }),
          registerDeviceIfNeeded: false,
        }).catch(() => 0);
      }
      setView({ kind: 'done', request: decided });
    } catch (err) {
      setView({ kind: 'error', message: err instanceof Error ? err.message : 'Something went wrong.' });
    }
  };

  const shell = (children: ReactNode) => (
    <main className="flex min-h-dvh items-center justify-center bg-bg px-4 py-12 text-fg">
      <div className="ds-anim-dialog w-full max-w-md rounded-xl bg-bg-elevated px-6 py-10 text-center shadow-overlay sm:px-10">
        {children}
      </div>
    </main>
  );
  const badge = (Icon: typeof ShieldQuestion, tone: 'accent' | 'destructive' = 'accent') => (
    <span
      className={cn(
        'mx-auto mb-5 flex size-16 items-center justify-center rounded-full',
        tone === 'accent' ? 'bg-selection text-accent' : 'bg-destructive-fill text-destructive',
      )}
    >
      <Icon size={28} strokeWidth={1.75} aria-hidden />
    </span>
  );

  if (view.kind === 'loading') {
    return shell(
      <div role="status" className="flex flex-col items-center gap-3">
        <Spinner />
        <p className="type-body text-fg-secondary">Checking your request…</p>
      </div>,
    );
  }

  if (view.kind === 'error') {
    return shell(
      <>
        {badge(XCircle, 'destructive')}
        <h1 className="type-title-3 mb-2">Can’t approve this device</h1>
        <p className="type-body text-fg-secondary">{view.message}</p>
      </>,
    );
  }

  if (view.kind === 'done') {
    const { request } = view;
    const title =
      request.status === 'approved'
        ? 'History sharing approved'
        : request.status === 'denied'
          ? 'Request denied'
          : 'This request has expired';
    const detail =
      request.status === 'approved'
        ? 'Approved. If this browser had your earlier chat keys, they were shared now. Otherwise, open Click on a device you used before to finish the transfer.'
        : request.status === 'denied'
          ? 'Your chat history stays on your existing devices. The new device will only see new messages.'
          : 'Sign in on the new device again to get a fresh email.';
    return shell(
      <>
        {badge(request.status === 'denied' ? XCircle : CheckCircle2, request.status === 'denied' ? 'destructive' : 'accent')}
        <h1 className="type-title-3 mb-2">{title}</h1>
        <p className="type-body text-fg-secondary">{detail}</p>
      </>,
    );
  }

  const saving = view.kind === 'saving';
  return shell(
    <>
      {badge(ShieldQuestion)}
      <h1 className="type-title-3 mb-2">A new device signed in to Click</h1>
      <p className="type-body mb-2 text-fg-secondary">
        A device was added to your account on {formatWhen(view.request.device_registered_at)}.
      </p>
      <p className="type-body mb-8 text-fg-secondary">
        Share your existing chat history with it? Only approve if this was you. Messages stay
        end-to-end encrypted: your other devices send the keys directly, and Click never sees them.
      </p>
      <div className="flex flex-col gap-2">
        <Button size="lg" fullWidth disabled={saving} loading={saving} onClick={() => decide('approve')}>
          Yes, share my history
        </Button>
        <Button size="lg" variant="plain" fullWidth disabled={saving} className="text-destructive" onClick={() => decide('deny')}>
          This wasn’t me
        </Button>
      </div>
    </>,
  );
}
