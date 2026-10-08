'use client';

import { useCallback, useEffect, useState } from 'react';
import { Laptop, ShieldQuestion, Smartphone } from 'lucide-react';
import { Button } from '@/components/ds/Button';
import { useConfirm } from '@/components/ds/ConfirmDialog';
import { EmptyState } from '@/components/ds/EmptyState';
import { RetryRow } from '@/components/ds/RetryRow';
import { Skeleton } from '@/components/ds/Skeleton';
import { StatusPill } from '@/components/ds/StatusPill';
import { toast } from '@/components/ds/Toast';
import { authedJson } from '@/lib/api/authedJson';
import { decideDeviceRequest } from '@/lib/chat/decideDeviceRequest';
import { newSignInSubject } from '@/lib/chat/deviceLabel';
import { loadOrCreateWebE2eeV2Identity, shareWebE2eeV2HistoryWithApprovedDevices } from '@/lib/chat/e2eeV2Client';
import { getFreshAuthHeaders } from '@/lib/auth/freshAuthHeaders';
import { useAuth } from '@/lib/AuthContext';
import {
  enrollBrowserHistoryRecovery, restoreBrowserHistory, refreshBrowserHistoryBackup,
} from '@/lib/chat/browserHistoryRecovery';
import { formatRelativeShort } from '@/lib/home/format';

type Device = { device_id: string; label: string | null; created_at: string; last_seen_at: string | null };
type Incoming = { id: string; device_label: string | null; created_at: string };
type State = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; devices: Device[]; incoming: Incoming[]; thisDevice: string | null };

const isPhone = (label: string | null) => /iphone|android|phone|ipad/i.test(label ?? '');

/** Puts this browser first, then the rest by last activity (the server's order). */
export function orderDevices(devices: Device[], thisDevice: string | null): Device[] {
  return [...devices].sort((a, b) => Number(b.device_id === thisDevice) - Number(a.device_id === thisDevice));
}

/**
 * Devices (spec §7.8): this account's chat devices with "This device", removal, and pending
 * history requests from new sign-ins, approved or declined from this browser with its key.
 */
export function DevicesSettings() {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [busy, setBusy] = useState<string | null>(null);
  const [recoveryEnrolled, setRecoveryEnrolled] = useState<boolean | null>(null);
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const [confirm, confirmDialog] = useConfirm();
  const userId = useAuth().user?.id ?? null;
  // eslint-disable-next-line react-hooks/purity -- relative labels only
  const nowMs = Date.now();

  const load = useCallback(async (): Promise<State> => {
    try {
      const thisDevice = await loadOrCreateWebE2eeV2Identity()
        .then((i) => i.deviceId)
        .catch(() => null);
      const [{ devices }, requests] = await Promise.all([
        authedJson<{ devices: Device[] }>('/api/me/devices'),
        thisDevice
          ? authedJson<{ incoming: Incoming[] }>(`/api/chat/devices/history-requests?device_id=${encodeURIComponent(thisDevice)}`)
          : Promise.resolve({ incoming: [] as Incoming[] }),
      ]);
      return { kind: 'ready', devices, incoming: requests.incoming, thisDevice };
    } catch {
      return { kind: 'error' };
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void load().then((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  useEffect(() => {
    if (!userId) { setRecoveryEnrolled(null); return; }
    let cancelled = false;
    void authedJson<{ vault: { version: number } | null }>('/api/chat/key-recovery/vault')
      .then(({ vault }) => { if (!cancelled) setRecoveryEnrolled(Boolean(vault)); })
      .catch(() => { if (!cancelled) setRecoveryEnrolled(null); });
    return () => { cancelled = true; };
  }, [userId]);

  const recover = async () => {
    if (!userId || recoveryEnrolled === null) return;
    setRecoveryBusy(true);
    try {
      if (recoveryEnrolled) {
        const count = await restoreBrowserHistory(userId, getFreshAuthHeaders);
        toast.success('Unlocked encrypted history for ' + count + ' conversation epochs.');
        void refreshBrowserHistoryBackup(userId, getFreshAuthHeaders).catch(() => {});
      } else {
        const count = await enrollBrowserHistoryRecovery(userId, getFreshAuthHeaders);
        setRecoveryEnrolled(true);
        toast.success('Passkey recovery enabled for ' + count + ' encrypted conversation epochs.');
      }
      window.dispatchEvent(new Event('click-history-restored'));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not access encrypted history recovery.');
    } finally {
      setRecoveryBusy(false);
    }
  };

  const retry = async () => {
    setState({ kind: 'loading' });
    setState(await load());
  };

  const decide = async (req: Incoming, decision: 'approve' | 'deny') => {
    setBusy(`${req.id}:${decision}`);
    try {
      await decideDeviceRequest(req.id, decision);
      toast.success(decision === 'approve' ? 'Approved. Your earlier messages are on their way.' : 'Request declined');
      // Share right away, so the new device reads its history within seconds.
      if (decision === 'approve' && userId) {
        void shareWebE2eeV2HistoryWithApprovedDevices({ currentUserId: userId, getAuthHeaders: getFreshAuthHeaders }).catch(() => 0);
      }
      setState((s) => (s.kind === 'ready' ? { ...s, incoming: s.incoming.filter((r) => r.id !== req.id) } : s));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Couldn’t save your decision.');
    } finally {
      setBusy(null);
    }
  };

  const remove = async (device: Device) => {
    const name = device.label ?? 'this device';
    const ok = await confirm({
      title: `Remove ${name}?`,
      message: 'It won’t be able to read new messages until it signs in and is approved again.',
      confirmLabel: 'Remove device',
      cancelLabel: 'Keep device',
      destructive: true,
    });
    if (!ok) return;
    setBusy(`${device.device_id}:remove`);
    try {
      await authedJson(`/api/chat/devices?device_id=${encodeURIComponent(device.device_id)}`, {
        method: 'DELETE',
        fallback: 'Couldn’t remove that device.',
      });
      setState((s) => (s.kind === 'ready' ? { ...s, devices: s.devices.filter((d) => d.device_id !== device.device_id) } : s));
      toast.success('Device removed');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Couldn’t remove that device.');
    } finally {
      setBusy(null);
    }
  };

  if (state.kind === 'loading') {
    return (
      <div aria-busy className="flex flex-col gap-2">
        <Skeleton rounded="lg" className="h-16" />
        <Skeleton rounded="lg" className="h-16" />
      </div>
    );
  }
  if (state.kind === 'error') return <RetryRow thing="your devices" onRetry={() => void retry()} />;

  const devices = orderDevices(state.devices, state.thisDevice);

  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="encrypted-history-recovery" className="rounded-lg bg-surface p-4">
        <h2 id="encrypted-history-recovery" className="type-body font-semibold text-fg">Encrypted history recovery</h2>
        <p className="type-meta mt-1 text-fg-secondary">
          {recoveryEnrolled
            ? 'Unlock older messages in another browser using your recovery passkey. Click cannot decrypt your backup.'
            : 'Set up a synced passkey to restore the encrypted message history already available on this browser.'}
          {' '}A new browser may ask for Face ID, Touch ID or your device PIN.
        </p>
        <div className="mt-3">
          <Button size="sm" variant="primary" disabled={recoveryEnrolled === null || recoveryBusy}
            loading={recoveryBusy} onClick={() => void recover()}>
            {recoveryEnrolled ? 'Restore history with passkey' : 'Set up passkey recovery'}
          </Button>
        </div>
      </section>
      {state.incoming.length > 0 ? (
        <section aria-labelledby="devices-pending">
          <h2 id="devices-pending" className="type-meta mb-2 px-4 font-semibold text-fg-secondary">
            Waiting for approval
          </h2>
          <ul className="overflow-hidden rounded-lg bg-surface dark:shadow-[inset_0_0_0_1px_var(--hairline)]">
            {state.incoming.map((req) => (
              <li key={req.id} className="flex flex-wrap items-center gap-3 px-4 py-3 shadow-[inset_0_1px_0_var(--hairline)] first:shadow-none">
                <ShieldQuestion size={20} strokeWidth={1.75} aria-hidden className="w-7 text-accent" />
                <span className="min-w-0 flex-1">
                  <span className="type-body block text-fg">{newSignInSubject(req.device_label)} wants your chat history</span>
                  <span className="type-meta block text-fg-tertiary">Signed in {formatRelativeShort(req.created_at, nowMs)}. Only approve it if it’s you.</span>
                </span>
                <span className="flex gap-2">
                  <Button size="sm" variant="secondary" loading={busy === `${req.id}:deny`} disabled={busy != null} onClick={() => void decide(req, 'deny')}>
                    Decline
                  </Button>
                  <Button size="sm" variant="primary" loading={busy === `${req.id}:approve`} disabled={busy != null} onClick={() => void decide(req, 'approve')}>
                    Approve
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {devices.length === 0 ? (
        <EmptyState icon={Laptop} title="No chat devices yet" body="Devices show up here once you open a chat on them." />
      ) : (
        <section aria-label="Your devices">
          <ul className="overflow-hidden rounded-lg bg-surface dark:shadow-[inset_0_0_0_1px_var(--hairline)]" data-testid="device-list">
            {devices.map((d) => {
              const mine = d.device_id === state.thisDevice;
              const Icon = isPhone(d.label) ? Smartphone : Laptop;
              return (
                <li key={d.device_id} className="flex min-h-16 items-center gap-3 px-4 py-3 shadow-[inset_0_1px_0_var(--hairline)] first:shadow-none">
                  <Icon size={20} strokeWidth={1.75} aria-hidden className="w-7 text-fg-secondary" />
                  <span className="min-w-0 flex-1">
                    <span className="type-body block truncate text-fg">{d.label ?? (mine ? 'This browser' : 'Unnamed device')}</span>
                    <span className="type-meta block text-fg-tertiary">
                      {d.last_seen_at ? `Active ${formatRelativeShort(d.last_seen_at, nowMs)}` : `Added ${formatRelativeShort(d.created_at, nowMs)}`}
                    </span>
                  </span>
                  {mine ? (
                    <StatusPill variant="tinted">This device</StatusPill>
                  ) : (
                    <Button
                      size="sm"
                      variant="plain"
                      className="text-destructive"
                      loading={busy === `${d.device_id}:remove`}
                      disabled={busy != null}
                      onClick={() => void remove(d)}
                    >
                      Remove
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="type-meta mt-2 px-4 text-fg-tertiary">Messages are end-to-end encrypted. Each device holds its own key.</p>
        </section>
      )}
      {confirmDialog}
    </div>
  );
}
