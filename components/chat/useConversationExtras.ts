'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import {
  CHAT_MUTES_KEY,
  PENDING_HANGOUTS_KEY,
  activeMute,
  cancelScheduled,
  fetchChatMutes,
  fetchPendingHangouts,
  fetchPins,
  fetchScheduled,
  logHangout,
  respondToHangout,
  setChatMute,
  setMessagePinned,
  type ChatMute,
  type MessagePin,
  type ScheduledRow,
} from '@/lib/chat/conversationApi';

export type ScheduledItem = { id: string; sendAt: number; text: string };

const quiet = { revalidateOnFocus: false, dedupingInterval: 30_000 } as const;

/** Notification mutes for every conversation (one request, shared by the inbox and threads). */
export function useChatMutes() {
  const { data, mutate } = useSWR<ChatMute[]>(CHAT_MUTES_KEY, fetchChatMutes, quiet);

  const muteFor = useCallback(
    (ids: readonly (string | null | undefined)[]) => activeMute(data, ids),
    [data],
  );

  /** Mute (`durationMs` null = until turned back on) or unmute; optimistic, rolled back on failure. */
  const setMuted = useCallback(
    async (chatId: string, muted: boolean, durationMs: number | null) => {
      const previous = data ?? [];
      const others = previous.filter((m) => m.chat_id !== chatId);
      const optimistic = muted
        ? [
            ...others,
            {
              chat_id: chatId,
              muted_until: durationMs == null ? null : new Date(Date.now() + durationMs).toISOString(),
            },
          ]
        : others;
      await mutate(
        async () => {
          await setChatMute(chatId, muted, durationMs);
          return optimistic;
        },
        { optimisticData: optimistic, rollbackOnError: true, revalidate: false },
      );
    },
    [data, mutate],
  );

  return { mutes: data, muteFor, setMuted };
}

/**
 * Per-thread extras shared with iOS `ConversationModel`: pinned messages, the viewer's
 * scheduled messages (decrypted on this device for display), and pending hangout
 * confirmations for a direct connection.
 */
export function useConversationExtras({
  chatId,
  connectionId,
  isGroupClique,
  decryptForDisplay,
}: {
  chatId: string | null;
  connectionId: string | null;
  isGroupClique: boolean;
  decryptForDisplay: (content: string, messageType: string) => Promise<string>;
}) {
  const { mutate: mutateGlobal } = useSWRConfig();

  // Pins
  const pinsKey = chatId ? (['chat-pins', chatId] as const) : null;
  const { data: pins, mutate: mutatePins } = useSWR<MessagePin[]>(
    pinsKey,
    ([, id]: readonly [string, string]) => fetchPins(id),
    quiet,
  );
  const pinnedIds = useMemo(() => new Set((pins ?? []).map((p) => p.message_id)), [pins]);

  const togglePin = useCallback(
    async (messageId: string, pinnedBy: string) => {
      const current = pins ?? [];
      const pinning = !current.some((p) => p.message_id === messageId);
      const next = pinning
        ? [{ message_id: messageId, pinned_by: pinnedBy, pinned_at: new Date().toISOString() }, ...current]
        : current.filter((p) => p.message_id !== messageId);
      await mutatePins(
        async () => {
          await setMessagePinned(messageId, pinning);
          return next;
        },
        { optimisticData: next, rollbackOnError: true, revalidate: false },
      );
      return pinning;
    },
    [mutatePins, pins],
  );

  // Scheduled messages (own). Content is ciphertext; decrypt locally for the list.
  const scheduledKey = chatId ? (['chat-scheduled', chatId] as const) : null;
  const { data: scheduledRows, mutate: mutateScheduled } = useSWR<ScheduledRow[]>(
    scheduledKey,
    ([, id]: readonly [string, string]) => fetchScheduled(id),
    quiet,
  );
  const [scheduled, setScheduled] = useState<ScheduledItem[]>([]);
  useEffect(() => {
    let cancelled = false;
    const rows = scheduledRows ?? [];
    void Promise.all(
      rows.map(async (row) => {
        let text = '';
        try {
          text = await decryptForDisplay(row.content, row.message_type);
        } catch {
          text = '';
        }
        if (!text || text === 'Encrypted message' || text.startsWith('e2e')) text = 'Scheduled message';
        return { id: row.id, sendAt: Number(row.send_at), text };
      }),
    ).then((items) => {
      if (!cancelled) setScheduled(items.sort((a, b) => a.sendAt - b.sendAt));
    });
    return () => {
      cancelled = true;
    };
  }, [decryptForDisplay, scheduledRows]);

  const addScheduled = useCallback(
    (row: ScheduledRow) => {
      void mutateScheduled((prev) => [...(prev ?? []), row], { revalidate: false });
    },
    [mutateScheduled],
  );

  const cancelScheduledItem = useCallback(
    async (id: string) => {
      try {
        await cancelScheduled(id);
      } finally {
        // It may have just been delivered; the server list is authoritative either way.
        await mutateScheduled();
      }
    },
    [mutateScheduled],
  );

  // Hangouts waiting for a confirmation (direct chats only).
  const { data: pendingHangouts, mutate: mutateHangouts } = useSWR(
    !isGroupClique && connectionId ? PENDING_HANGOUTS_KEY : null,
    fetchPendingHangouts,
    quiet,
  );
  const hangouts = useMemo(
    () => (pendingHangouts ?? []).filter((h) => h.connection_id === connectionId),
    [connectionId, pendingHangouts],
  );

  const answerHangout = useCallback(
    async (id: string, confirm: boolean) => {
      await respondToHangout(id, confirm);
      await mutateHangouts();
    },
    [mutateHangouts],
  );

  const requestHangout = useCallback(
    async (locationName: string | null) => {
      if (!connectionId) return;
      await logHangout(connectionId, locationName);
      await mutateGlobal(PENDING_HANGOUTS_KEY);
    },
    [connectionId, mutateGlobal],
  );

  return {
    pins: pins ?? [],
    pinnedIds,
    togglePin,
    scheduled,
    addScheduled,
    cancelScheduled: cancelScheduledItem,
    hangouts,
    answerHangout,
    requestHangout,
  };
}
