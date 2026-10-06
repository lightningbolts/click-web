'use client';

import { useCallback, useEffect, useState } from 'react';
import type { InlineNoticeVariant } from '@/components/ds/InlineNotice';
import type { DerivedKeys } from '@/lib/chat/crypto';
import {
  E2eeV2UnavailableError,
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
type DeviceState =
  | { kind: 'ok' }
  | { kind: 'unapproved'; request: OwnRequest }
  | { kind: 'asking' };

/** Keys normally derive in well under a second; only say so when it takes longer. */
const SLOW_KEYS_MS = 1500;

async function jsonHeaders(getAuthHeaders: () => Promise<HeadersInit>) {
  const headers = new Headers(await getAuthHeaders());
  headers.set('Content-Type', 'application/json');
  return headers;
}

async function fetchOwnRequest(getAuthHeaders: () => Promise<HeadersInit>): Promise<OwnRequest> {
  const { deviceId } = await loadOrCreateWebE2eeV2Identity();
  const res = await fetch(`/api/chat/devices/history-requests?device_id=${encodeURIComponent(deviceId)}`, {
    headers: await getAuthHeaders(),
  });
  if (!res.ok) return null;
  const json = (await res.json().catch(() => ({}))) as { own?: OwnRequest };
  return json.own ?? null;
}

/**
 * The thread's one encryption notice (spec §7.2), from every state `useChatEncryption` and the
 * device-approval flow can produce:
 *
 * - group key couldn't be unlocked → destructive, "Try again" (reload);
 * - keys still deriving after 1.5 s → neutral, no action;
 * - this browser isn't approved for the chat's current key (not registered, not approved, or
 *   unwrap failed) and hasn't asked → warning, "Ask my other devices";
 * - asked and waiting → info, "Check again" (mentions the email fallback once it's been sent);
 * - asked and declined → warning, "Ask again".
 *
 * Messages that still can't be decrypted say so in their bubble.
 */
export function useE2eeNotice({
  chatId,
  isGroupClique,
  e2eKeys,
  groupMasterKey,
  groupKeyError,
  getE2eeV2Session,
  getAuthHeaders,
}: {
  chatId: string | null;
  isGroupClique: boolean;
  e2eKeys: DerivedKeys | null;
  groupMasterKey: ArrayBuffer | null;
  groupKeyError: string | null;
  getE2eeV2Session: (allowUpgrade?: boolean, forceRefresh?: boolean) => Promise<E2eeV2Session | null>;
  getAuthHeaders: () => Promise<HeadersInit>;
}): E2eeNotice | null {
  const keysReady = isGroupClique ? Boolean(groupMasterKey) : Boolean(e2eKeys);
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (keysReady || groupKeyError) return;
    const t = window.setTimeout(() => setSlow(true), SLOW_KEYS_MS);
    return () => window.clearTimeout(t);
  }, [keysReady, groupKeyError]);

  const [device, setDevice] = useState<{ chatId: string; state: DeviceState } | null>(null);
  const check = useCallback(
    async (id: string, forceRefresh: boolean) => {
      try {
        await getE2eeV2Session(false, forceRefresh);
        setDevice({ chatId: id, state: { kind: 'ok' } });
      } catch (err) {
        if (!(err instanceof E2eeV2UnavailableError)) return;
        const request = await fetchOwnRequest(getAuthHeaders).catch(() => null);
        setDevice({ chatId: id, state: request?.status === 'approved' ? { kind: 'ok' } : { kind: 'unapproved', request } });
      }
    },
    [getAuthHeaders, getE2eeV2Session],
  );
  useEffect(() => {
    if (!chatId || !keysReady) return;
    void check(chatId, false);
  }, [chatId, keysReady, check]);

  const ask = useCallback(
    async (id: string, reopen: boolean) => {
      setDevice({ chatId: id, state: { kind: 'asking' } });
      try {
        const { deviceId } = await loadOrCreateWebE2eeV2Identity();
        const res = await fetch('/api/chat/devices/history-requests', {
          method: 'POST',
          headers: await jsonHeaders(getAuthHeaders),
          body: JSON.stringify({ device_id: deviceId, ...(reopen ? { reopen: true } : {}) }),
        });
        const json = (await res.json().catch(() => ({}))) as { own?: OwnRequest };
        setDevice({ chatId: id, state: { kind: 'unapproved', request: json.own ?? null } });
      } catch {
        setDevice({ chatId: id, state: { kind: 'unapproved', request: null } });
      }
    },
    [getAuthHeaders],
  );

  if (groupKeyError) {
    return {
      key: 'group-key',
      variant: 'destructive',
      text: groupKeyError,
      action: { label: 'Try again', onClick: () => window.location.reload() },
    };
  }
  if (!keysReady) {
    return slow ? { key: 'keys', variant: 'neutral', text: 'Unlocking end-to-end encryption…', action: null } : null;
  }
  const state = device && device.chatId === chatId ? device.state : null;
  if (!chatId || !state || state.kind === 'ok') return null;
  if (state.kind === 'asking') {
    return { key: 'device-asking', variant: 'info', text: 'Asking your other devices…', action: null };
  }
  const request = state.request;
  if (!request || request.expired) {
    return {
      key: 'device-unapproved',
      variant: 'warning',
      text: 'This browser isn’t approved to read this chat yet.',
      action: { label: 'Ask my other devices', onClick: () => void ask(chatId, false) },
    };
  }
  if (request.status === 'denied') {
    return {
      key: 'device-denied',
      variant: 'warning',
      text: 'Earlier messages aren’t available in this browser. The request was declined.',
      action: { label: 'Ask again', onClick: () => void ask(chatId, true) },
    };
  }
  return {
    key: 'device-pending',
    variant: 'info',
    text: request.email_sent
      ? 'Waiting for approval. Open the link we emailed you, or approve in Click on your phone.'
      : 'Waiting for approval. Open Click on your phone to approve this browser.',
    action: { label: 'Check again', onClick: () => void check(chatId, true) },
  };
}
