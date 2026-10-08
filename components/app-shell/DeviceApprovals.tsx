'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ds/Button';
import { Dialog } from '@/components/ds/Dialog';
import { toast } from '@/components/ds/Toast';
import { useAuth } from '@/lib/AuthContext';
import { refreshBrowserHistoryBackup, resetBrowserHistoryRecovery } from '@/lib/chat/browserHistoryRecovery';
import { getFreshAuthHeaders } from '@/lib/auth/freshAuthHeaders';
import { authedJson } from '@/lib/api/authedJson';
import { decideDeviceRequest } from '@/lib/chat/decideDeviceRequest';
import { newSignInSubject } from '@/lib/chat/deviceLabel';
import { loadOrCreateWebE2eeV2Identity, shareWebE2eeV2HistoryWithApprovedDevices } from '@/lib/chat/e2eeV2Client';

type Incoming = { id: string; device_label: string | null; created_at: string };

/** At most one sync per this long (focus, visibility and the timer all ask). */
const SYNC_MIN_GAP_MS = 15_000;
/** While the tab is visible, look for new sign-ins this often. */
const SYNC_POLL_MS = 60_000;

const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

/** " 5 minutes ago", " just now", or "" for a bad timestamp. */
function signedInWhen(iso: string, nowMs: number): string {
  const minutes = Math.round((nowMs - Date.parse(iso)) / 60_000);
  if (!Number.isFinite(minutes)) return '';
  if (minutes < 1) return ' just now';
  if (minutes < 60) return ` ${relative.format(-minutes, 'minute')}`;
  if (minutes < 1440) return ` ${relative.format(-Math.round(minutes / 60), 'hour')}`;
  return ` ${relative.format(-Math.round(minutes / 1440), 'day')}`;
}

/** Requests seen this page session that the user closed or decided: never offered again here. */
const settled = new Set<string>();

/**
 * Device history for the signed-in browser (iOS `syncDeviceHistory` parity): on open, focus and
 * every minute while visible, it registers this browser (so chats started from now on include
 * it), shares chat history with the account's approved newer devices, and offers
 * "Approve new sign-in?" when another device of the account is waiting on approval. Approving
 * shares right away, so the new device reads its earlier messages within seconds.
 */
export function DeviceApprovals() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [request, setRequest] = useState<(Incoming & { when: string }) | null>(null);
  const [phase, setPhase] = useState<'asking' | 'approving' | 'denying'>('asking');
  const lastSync = useRef(0);

  const share = useCallback(
    (id: string) => shareWebE2eeV2HistoryWithApprovedDevices({ currentUserId: id, getAuthHeaders: getFreshAuthHeaders }).catch(() => 0),
    [],
  );

  const sync = useCallback(
    async (id: string) => {
      if (Date.now() - lastSync.current < SYNC_MIN_GAP_MS) return;
      lastSync.current = Date.now();
      // Sharing registers this browser first; the request list needs it registered.
      await share(id);
      void refreshBrowserHistoryBackup(id, getFreshAuthHeaders).catch(() => {});
      const { deviceId } = await loadOrCreateWebE2eeV2Identity();
      const { incoming } = await authedJson<{ incoming: Incoming[] }>(
        `/api/chat/devices/history-requests?device_id=${encodeURIComponent(deviceId)}`,
      );
      const next = incoming.find((r) => !settled.has(r.id));
      setRequest((current) => current ?? (next ? { ...next, when: signedInWhen(next.created_at, Date.now()) } : null));
    },
    [share],
  );

  // A recovery key never survives an account change or an app-shell unmount.
  useEffect(() => {
    return () => resetBrowserHistoryRecovery();
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    const run = () => {
      if (document.visibilityState === 'visible') void sync(userId).catch(() => {});
    };
    run();
    const timer = window.setInterval(run, SYNC_POLL_MS);
    window.addEventListener('focus', run);
    document.addEventListener('visibilitychange', run);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', run);
      document.removeEventListener('visibilitychange', run);
    };
  }, [userId, sync]);

  const close = () => {
    if (request) settled.add(request.id);
    setRequest(null);
    setPhase('asking');
  };

  const decide = async (decision: 'approve' | 'deny') => {
    if (!request || !userId) return;
    setPhase(decision === 'approve' ? 'approving' : 'denying');
    try {
      await decideDeviceRequest(request.id, decision);
      const subject = newSignInSubject(request.device_label);
      close();
      if (decision === 'approve') {
        toast.success('Approved. Your earlier messages are on their way.');
        void share(userId);
      } else {
        toast(`${subject} can’t read your earlier messages. If it wasn’t you, change your password.`);
      }
    } catch (e) {
      setPhase('asking');
      toast.error(e instanceof Error ? e.message : 'Couldn’t reach Click. Check your connection and try again.');
    }
  };

  if (!request) return null;
  const busy = phase !== 'asking';
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) close();
      }}
      title="Approve new sign-in?"
      description={`${newSignInSubject(request.device_label)} signed in to your Click account${request.when}. Approve it to let it read your earlier messages. Only approve it if it’s you.`}
      initialFocusSelector="[data-safe]"
      footer={
        <>
          <Button variant="secondary" data-safe disabled={busy} loading={phase === 'denying'} onClick={() => void decide('deny')}>
            This wasn’t me
          </Button>
          <Button variant="primary" disabled={busy} loading={phase === 'approving'} onClick={() => void decide('approve')}>
            Approve
          </Button>
        </>
      }
    />
  );
}
