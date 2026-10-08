'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { InlineNoticeVariant } from '@/components/ds/InlineNotice';
import { toast } from '@/components/ds/Toast';
import type { DerivedKeys } from '@/lib/chat/crypto';
import { isBrowserDeviceLabel, isMobileAppDeviceLabel } from '@/lib/chat/deviceLabel';
import {
  E2eeV2UnavailableError,
  invalidateWebE2eeV2Session,
  loadOrCreateWebE2eeV2Identity,
  type E2eeV2Session,
} from '@/lib/chat/e2eeV2Client';

export type E2eeNotice = {
  key: string;
  variant: InlineNoticeVariant;
  text: string;
  action: { label: string; onClick: () => void } | null;
};

type OwnRequest = { status: 'pending' | 'approved' | 'denied'; expired: boolean; email_sent: boolean } | null;
type Approver = { label: string | null; last_seen_at: string | null };
type Approval = { own: OwnRequest; approvers: Approver[] };
type DeviceState =
  /** `approval` is only read when some of the thread is unreadable here. */
  | { kind: 'checked'; canRead: boolean; approval: Approval | null }
  | { kind: 'asking'; approval: Approval | null };

/** Keys normally derive in well under a second; only say so when it takes longer. */
const SLOW_KEYS_MS = 1500;
/** While waiting on another device, re-check this often (visible tab only). */
const WAITING_POLL_MS = 3_000;
/** Chats whose final "can't be read here" notice was dismissed this page session. */
const dismissedChats = new Set<string>();

async function jsonHeaders(getAuthHeaders: () => Promise<HeadersInit>) {
  const headers = new Headers(await getAuthHeaders());
  headers.set('Content-Type', 'application/json');
  return headers;
}

async function fetchApproval(getAuthHeaders: () => Promise<HeadersInit>): Promise<Approval | null> {
  const { deviceId } = await loadOrCreateWebE2eeV2Identity();
  const res = await fetch(`/api/chat/devices/history-requests?device_id=${encodeURIComponent(deviceId)}`, {
    headers: await getAuthHeaders(),
  });
  if (!res.ok) return null;
  const json = (await res.json().catch(() => ({}))) as { own?: OwnRequest; approvers?: Approver[] };
  return { own: json.own ?? null, approvers: json.approvers ?? [] };
}

/**
 * Where to approve this browser from, for "approve this browser …": a phone first (the most
 * likely to be at hand), then a named browser ("from Chrome on your Mac"), then a neutral fallback.
 */
export function approverPlace(approvers: Approver[]): string {
  const phone = approvers.find((a) => isMobileAppDeviceLabel(a.label));
  if (phone) return `from your ${phone.label}`;
  const browser = approvers.find((a) => a.label && / on /.test(a.label));
  if (browser?.label) return `from ${browser.label.replace(/^Browser /, 'a browser ').replace(/ on /, ' on your ')}`;
  if (approvers.every((a) => isBrowserDeviceLabel(a.label))) return 'from the other browser you use Click in';
  return 'from a device you already use Click on';
}

/**
 * The thread's one encryption notice (spec §7.2), plus what unreadable bubbles say. From every
 * state `useChatEncryption` and the device-approval flow can produce:
 *
 * - group key couldn't be unlocked → destructive, "Try again" (reload);
 * - keys still deriving after 1.5 s → neutral, no action;
 * - some messages can't be read here (this browser isn't approved for the chat's current key, or
 *   was set up after them), by the request's state: none yet → "Ask to share"; waiting → where to
 *   approve it (and the email fallback once sent); approved → waiting for that device to share;
 *   declined → "Ask again"; no other device to ask → a dismissible explanation.
 *
 * While waiting it re-checks on its own (every 15 s while visible, and on focus), and calls
 * [onKeysChanged] whenever this browser can read the chat so unreadable messages decrypt in place.
 */
export function useE2eeNotice({
  chatId,
  isGroupClique,
  e2eKeys,
  groupMasterKey,
  groupKeyError,
  getE2eeV2Session,
  getAuthHeaders,
  hasLockedMessages,
  onKeysChanged,
}: {
  chatId: string | null;
  isGroupClique: boolean;
  e2eKeys: DerivedKeys | null;
  groupMasterKey: ArrayBuffer | null;
  groupKeyError: string | null;
  getE2eeV2Session: (allowUpgrade?: boolean, forceRefresh?: boolean) => Promise<E2eeV2Session | null>;
  getAuthHeaders: () => Promise<HeadersInit>;
  /** Some loaded message is still ciphertext. */
  hasLockedMessages: boolean;
  onKeysChanged: () => void;
}): { notice: E2eeNotice | null; lockedText: string | null } {
  const keysReady = isGroupClique ? Boolean(groupMasterKey) : Boolean(e2eKeys);
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (keysReady || groupKeyError) return;
    const t = window.setTimeout(() => setSlow(true), SLOW_KEYS_MS);
    return () => window.clearTimeout(t);
  }, [keysReady, groupKeyError]);

  const [device, setDevice] = useState<{ chatId: string; state: DeviceState } | null>(null);
  const [, setDismissTick] = useState(0);
  const lockedRef = useRef(hasLockedMessages);
  const onKeysChangedRef = useRef(onKeysChanged);
  useEffect(() => {
    lockedRef.current = hasLockedMessages;
    onKeysChangedRef.current = onKeysChanged;
  });

  const check = useCallback(
    async (id: string, fresh: boolean) => {
      // A fresh check re-reads this browser's keys (another device may have just shared them).
      if (fresh) invalidateWebE2eeV2Session(id);
      let canRead = true;
      try {
        await getE2eeV2Session(false);
      } catch (err) {
        if (!(err instanceof E2eeV2UnavailableError)) return;
        canRead = false;
      }
      const approval = !canRead || lockedRef.current ? await fetchApproval(getAuthHeaders).catch(() => null) : null;
      setDevice({ chatId: id, state: { kind: 'checked', canRead, approval } });
      if (canRead && fresh) onKeysChangedRef.current();
    },
    [getAuthHeaders, getE2eeV2Session],
  );

  useEffect(() => {
    if (!chatId || !keysReady) return;
    void check(chatId, false);
  }, [chatId, keysReady, check]);

  // Messages that turned out unreadable after the first check: learn why (once).
  const state = device && device.chatId === chatId ? device.state : null;
  const needsApproval = Boolean(chatId && hasLockedMessages && state?.kind === 'checked' && state.canRead && !state.approval);
  useEffect(() => {
    if (needsApproval && chatId) void check(chatId, false);
  }, [needsApproval, chatId, check]);

  const ask = useCallback(
    async (id: string, reopen: boolean) => {
      const priorState = device?.chatId === id ? device.state : null;
      const prior = priorState?.approval ?? null;
      const canRead = priorState?.kind === 'checked' ? priorState.canRead : false;
      setDevice({ chatId: id, state: { kind: 'asking', approval: prior } });
      try {
        const { deviceId } = await loadOrCreateWebE2eeV2Identity();
        const res = await fetch('/api/chat/devices/history-requests', {
          method: 'POST',
          headers: await jsonHeaders(getAuthHeaders),
          body: JSON.stringify({ device_id: deviceId, ...(reopen ? { reopen: true } : {}) }),
        });
        const json = (await res.json().catch(() => ({}))) as { own?: OwnRequest };
        if (!res.ok) throw new Error('ask failed');
        setDevice({ chatId: id, state: { kind: 'checked', canRead, approval: { own: json.own ?? null, approvers: prior?.approvers ?? [] } } });
      } catch {
        // Back to where it was, so the action stays available, and say it didn't go through.
        setDevice({ chatId: id, state: { kind: 'checked', canRead, approval: prior } });
        toast.error('Couldn’t ask your other devices. Check your connection and try again.');
      }
    },
    [device, getAuthHeaders],
  );

  const view = describe({ chatId, state, hasLockedMessages });

  // Waiting on another device: keep checking, so messages appear without a reload.
  const waiting = view?.waiting ?? false;
  useEffect(() => {
    if (!chatId || !waiting) return;
    const recheck = () => {
      if (document.visibilityState === 'visible') void check(chatId, true);
    };
    const timer = window.setInterval(recheck, WAITING_POLL_MS);
    window.addEventListener('focus', recheck);
    document.addEventListener('visibilitychange', recheck);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', recheck);
      document.removeEventListener('visibilitychange', recheck);
    };
  }, [chatId, waiting, check]);

  if (groupKeyError) {
    return {
      notice: {
        key: 'group-key',
        variant: 'destructive',
        text: groupKeyError,
        action: { label: 'Try again', onClick: () => window.location.reload() },
      },
      lockedText: null,
    };
  }
  if (!keysReady) {
    return {
      notice: slow ? { key: 'keys', variant: 'neutral', text: 'Unlocking end-to-end encryption…', action: null } : null,
      lockedText: null,
    };
  }
  if (!chatId || !view) return { notice: null, lockedText: null };

  const actionFor = (kind: View['action']): E2eeNotice['action'] => {
    switch (kind) {
      case 'ask':
        return { label: 'Ask to share', onClick: () => void ask(chatId, false) };
      case 'ask-again':
        return { label: 'Ask again', onClick: () => void ask(chatId, true) };
      case 'check':
        return { label: 'Check again', onClick: () => void check(chatId, true) };
      case 'dismiss':
        return {
          label: 'Got it',
          onClick: () => {
            dismissedChats.add(chatId);
            setDismissTick((n) => n + 1);
          },
        };
      default:
        return null;
    }
  };
  const hidden = view.action === 'dismiss' && dismissedChats.has(chatId);
  return {
    notice: hidden ? null : { key: view.key, variant: view.variant, text: view.text, action: actionFor(view.action) },
    lockedText: view.lockedText,
  };
}

type View = {
  key: string;
  variant: InlineNoticeVariant;
  text: string;
  action: 'ask' | 'ask-again' | 'check' | 'dismiss' | null;
  lockedText: string;
  /** Another device can still unlock this; keep checking. */
  waiting: boolean;
};

const NOT_YET = 'Not available in this browser yet';
const NOT_HERE = 'Not available in this browser';

/** The notice for this chat's device state; null when everything here is readable. */
export function describe({
  chatId,
  state,
  hasLockedMessages,
}: {
  chatId: string | null;
  state: DeviceState | null;
  hasLockedMessages: boolean;
}): View | null {
  if (!chatId || !state) return null;
  if (state.kind === 'asking') {
    return { key: 'device-asking', variant: 'info', text: 'Asking your other devices…', action: null, lockedText: NOT_YET, waiting: false };
  }
  if (state.canRead && !hasLockedMessages) return null;
  const approval = state.approval;
  // Couldn't load the request: say what's true without guessing what to do.
  if (!approval) {
    return state.canRead
      ? null
      : { key: 'device-unknown', variant: 'info', text: 'Some messages can’t be read in this browser yet.', action: 'check', lockedText: NOT_YET, waiting: true };
  }
  const { own, approvers } = approval;
  if (approvers.length === 0) {
    return {
      key: 'device-first',
      variant: 'neutral',
      text: 'Messages sent before this browser was set up can’t be read here. New messages will be.',
      action: 'dismiss',
      lockedText: NOT_HERE,
      waiting: false,
    };
  }
  const where = approverPlace(approvers);
  if (!own || own.expired) {
    return {
      key: 'device-unapproved',
      variant: 'warning',
      text: `Earlier messages are on your other devices. Ask to share them with this browser, then approve it ${where}.`,
      action: own?.expired ? 'ask-again' : 'ask',
      lockedText: NOT_YET,
      waiting: false,
    };
  }
  if (own.status === 'denied') {
    return {
      key: 'device-denied',
      variant: 'warning',
      text: 'Earlier messages aren’t available in this browser because the request was declined.',
      action: 'ask-again',
      lockedText: NOT_HERE,
      waiting: false,
    };
  }
  if (own.status === 'approved') {
    return {
      key: 'device-approved',
      variant: 'info',
      text: `Approved. Earlier messages appear here as soon as Click is open ${where}.`,
      action: 'check',
      lockedText: NOT_YET,
      waiting: true,
    };
  }
  return {
    key: 'device-pending',
    variant: 'info',
    text: own.email_sent
      ? `To see earlier messages here, approve this browser ${where}, or open the link we emailed you.`
      : `To see earlier messages here, approve this browser ${where}.`,
    action: 'check',
    lockedText: NOT_YET,
    waiting: true,
  };
}
