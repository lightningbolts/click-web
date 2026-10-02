'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useParams } from 'next/navigation';
import { CheckCircle2, Loader2, ShieldQuestion, XCircle } from 'lucide-react';

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
      setView({ kind: 'done', request: body.request as HistoryRequest });
    } catch (err) {
      setView({ kind: 'error', message: err instanceof Error ? err.message : 'Something went wrong.' });
    }
  };

  const shell = (children: ReactNode) => (
    <div className="min-h-[calc(100vh-1px)] relative flex items-center justify-center p-4 bg-[#121212] text-white overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_85%_55%_at_50%_-25%,rgba(124,58,237,0.14),transparent)]"
        aria-hidden
      />
      <div className="relative z-10 glass max-w-md w-full p-10 rounded-3xl border border-zinc-800 ring-1 ring-white/5 text-center">
        {children}
      </div>
    </div>
  );

  if (view.kind === 'loading') {
    return shell(
      <>
        <Loader2 className="w-8 h-8 text-[#8338EC] animate-spin mx-auto mb-4" aria-hidden />
        <p className="text-zinc-400 text-sm">Checking your request…</p>
      </>,
    );
  }

  if (view.kind === 'error') {
    return shell(
      <>
        <XCircle className="w-10 h-10 text-red-400 mx-auto mb-4" aria-hidden />
        <h1 className="text-xl font-bold mb-2">Can&apos;t approve this device</h1>
        <p className="text-zinc-400 text-sm">{view.message}</p>
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
        ? 'Your other devices will send your chat history to the new device the next time they open Click.'
        : request.status === 'denied'
          ? 'Your chat history stays on your existing devices. The new device will only see new messages.'
          : 'Sign in on the new device again to get a fresh email.';
    return shell(
      <>
        <CheckCircle2 className="w-10 h-10 text-[#8338EC] mx-auto mb-4" aria-hidden />
        <h1 className="text-xl font-bold mb-2">{title}</h1>
        <p className="text-zinc-400 text-sm">{detail}</p>
      </>,
    );
  }

  const saving = view.kind === 'saving';
  return shell(
    <>
      <ShieldQuestion className="w-10 h-10 text-[#8338EC] mx-auto mb-4" aria-hidden />
      <h1 className="text-xl font-bold mb-2">A new device signed in to Click</h1>
      <p className="text-zinc-400 text-sm mb-2">
        A device was added to your account on {formatWhen(view.request.device_registered_at)}.
      </p>
      <p className="text-zinc-400 text-sm mb-8">
        Share your existing chat history with it? Only approve if this was you. Messages stay
        end-to-end encrypted: your other devices send the keys directly, Click never sees them.
      </p>
      <div className="flex flex-col gap-3">
        <button
          type="button"
          disabled={saving}
          onClick={() => decide('approve')}
          className="w-full py-3 bg-[#8338EC] hover:bg-[#9d4eff] disabled:opacity-60 rounded-xl font-semibold transition-colors"
        >
          {saving ? 'Saving…' : 'Yes, share my history'}
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => decide('deny')}
          className="w-full py-3 border border-zinc-700 hover:border-zinc-500 disabled:opacity-60 rounded-xl font-semibold transition-colors"
        >
          This wasn&apos;t me
        </button>
      </div>
    </>,
  );
}
