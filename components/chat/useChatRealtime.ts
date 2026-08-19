'use client';

import {
  useEffect,
  type Dispatch,
  type MutableRefObject,
  type RefObject,
  type SetStateAction,
} from 'react';
import { getSupabaseClient } from '@/lib/supabase';
import type { Message } from '@/lib/chat/types';
import { normalizeDbMessage } from '@/lib/chat/messages';
import {
  decryptContent,
  isEncrypted,
  isGroupMessageEncrypted,
  decryptGroupMessageContent,
  type DerivedKeys,
} from '@/lib/chat/crypto';
import { CLIENT_OPTIMISTIC_MESSAGE_ID_PREFIX } from '@/lib/chat/clientOptimistic';

/**
 * Supabase Realtime subscription for one chat: message INSERT/UPDATE/DELETE,
 * reaction changes, and the typing-indicator broadcast. Extracted verbatim
 * from ChatView.
 */
export function useChatRealtime({
  chatId,
  currentUserId,
  isGroupClique,
  e2eKeys,
  groupMasterKey,
  setMessages,
  setTypingIndicator,
  typingTimeoutRef,
  channelRef,
  scrollContainerRef,
  scrollToBottom,
  firePeerDeliveredAck,
}: {
  chatId: string | null;
  currentUserId: string;
  isGroupClique: boolean;
  e2eKeys: DerivedKeys | null;
  groupMasterKey: ArrayBuffer | null;
  setMessages: Dispatch<SetStateAction<Message[]>>;
  setTypingIndicator: Dispatch<SetStateAction<boolean>>;
  typingTimeoutRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
  channelRef: MutableRefObject<any>;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  scrollToBottom: (smooth?: boolean) => void;
  firePeerDeliveredAck: (messageIds: string[]) => Promise<void>;
}) {
  useEffect(() => {
    if (!chatId) return;

    const supabase = getSupabaseClient();
    if (!supabase) return;

    const isNearBottom = () => {
      const el = scrollContainerRef.current;
      if (!el) return true;
      return el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    };

    const decryptIfNeeded = async (content: string): Promise<string> => {
      if (isGroupClique && groupMasterKey && isGroupMessageEncrypted(content)) {
        return decryptGroupMessageContent(content, groupMasterKey);
      }
      if (e2eKeys && isEncrypted(content)) {
        return decryptContent(content, e2eKeys);
      }
      return content;
    };

    const channel = supabase
      .channel(`chat:${chatId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages', filter: `chat_id=eq.${chatId}` },
        async (payload: any) => {
          const { eventType, new: newRow, old: oldRow } = payload;

          if (eventType === 'INSERT') {
            const skipDecrypt = newRow.message_type === 'call_log';
            const plainContent = skipDecrypt
              ? (newRow.content ?? '')
              : await decryptIfNeeded(newRow.content ?? '');
            const msg = normalizeDbMessage({
              ...newRow,
              content: plainContent,
              reactions: {},
            });
            setMessages((prev) => {
              if (prev.some((m) => m.id === msg.id)) return prev;

              const lsat = msg.local_sent_at ?? null;
              if (
                lsat != null &&
                msg.user_id === currentUserId &&
                msg.message_type === 'text'
              ) {
                const idx = prev.findIndex(
                  (m) =>
                    m.id.startsWith(CLIENT_OPTIMISTIC_MESSAGE_ID_PREFIX) &&
                    m.local_sent_at === lsat,
                );
                if (idx >= 0) {
                  const opt = prev[idx];
                  const optMeta =
                    opt.metadata && typeof opt.metadata === 'object' && !Array.isArray(opt.metadata)
                      ? { ...(opt.metadata as Record<string, unknown>) }
                      : {};
                  const bubbleKey =
                    typeof optMeta._bubbleKey === 'string' ? optMeta._bubbleKey : opt.id;
                  const postAck = optMeta._webPostAck === true;
                  const serverMeta =
                    msg.metadata && typeof msg.metadata === 'object' && !Array.isArray(msg.metadata)
                      ? { ...(msg.metadata as Record<string, unknown>) }
                      : {};
                  const mergedMeta: Message['metadata'] = {
                    ...serverMeta,
                    _bubbleKey: bubbleKey,
                    ...(postAck ? { _webPostAck: true as const } : {}),
                  };
                  const merged: Message = { ...msg, metadata: mergedMeta };
                  const next = [...prev.slice(0, idx), merged, ...prev.slice(idx + 1)];
                  if (isNearBottom()) setTimeout(() => scrollToBottom(), 60);
                  return next;
                }
              }

              const updated = [...prev, msg];
              if (isNearBottom()) setTimeout(() => scrollToBottom(), 60);
              return updated;
            });
            if (msg.user_id !== currentUserId && (msg.delivered_at == null || msg.delivered_at === undefined)) {
              void firePeerDeliveredAck([msg.id]);
            }
          } else if (eventType === 'UPDATE') {
            const skipDecrypt = newRow.message_type === 'call_log';
            const plainContent = skipDecrypt
              ? (newRow.content ?? '')
              : await decryptIfNeeded(newRow.content ?? '');
            setMessages((prev) =>
              prev.map((m) => {
                if (m.id !== newRow.id) return m;
                const next = normalizeDbMessage({
                  ...m,
                  ...newRow,
                  content: plainContent,
                  reactions: m.reactions,
                });
                const prevMeta =
                  m.metadata && typeof m.metadata === 'object' && !Array.isArray(m.metadata)
                    ? (m.metadata as Record<string, unknown>)
                    : {};
                const nextMeta =
                  next.metadata && typeof next.metadata === 'object' && !Array.isArray(next.metadata)
                    ? { ...(next.metadata as Record<string, unknown>) }
                    : {};
                const mergedMeta: Message['metadata'] = {
                  ...nextMeta,
                  ...(typeof prevMeta._bubbleKey === 'string' ? { _bubbleKey: prevMeta._bubbleKey } : {}),
                  ...(prevMeta._webPostAck === true ? { _webPostAck: true as const } : {}),
                };
                return { ...next, metadata: mergedMeta };
              })
            );
          } else if (eventType === 'DELETE') {
            setMessages((prev) => prev.filter((m) => m.id !== oldRow.id));
          }
        }
      )
      // Reaction inserts / deletes
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'message_reactions' },
        (payload: any) => {
          const { eventType, new: newRow, old: oldRow } = payload;

          setMessages((prev) =>
            prev.map((m) => {
              const reactions = { ...(m.reactions ?? {}) };

              if (eventType === 'INSERT' && newRow.message_id === m.id) {
                const list = reactions[newRow.reaction_type] ?? [];
                if (!list.some((r: any) => r.id === newRow.id || (r.user_id === newRow.user_id && r.reaction_type === newRow.reaction_type))) {
                  reactions[newRow.reaction_type] = [...list, newRow];
                }
              } else if (eventType === 'DELETE' && oldRow.message_id === m.id) {
                const reactionType = oldRow.reaction_type as string | undefined;
                if (reactionType) {
                  const list = (reactions[reactionType] ?? []).filter(
                    (r: any) => r.id !== oldRow.id
                  );
                  if (list.length > 0) reactions[reactionType] = list;
                  else delete reactions[reactionType];
                } else {
                  Object.keys(reactions).forEach((emoji) => {
                    const list = (reactions[emoji] ?? []).filter((r: any) => r.id !== oldRow.id);
                    if (list.length > 0) reactions[emoji] = list;
                    else delete reactions[emoji];
                  });
                }
              }

              return { ...m, reactions };
            })
          );
        }
      )
      // Typing indicator via broadcast (best-effort, no persistence)
      .on('broadcast', { event: 'typing' }, (payload: any) => {
        if (payload.payload?.userId !== currentUserId) {
          setTypingIndicator(true);
          if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
          typingTimeoutRef.current = setTimeout(() => setTypingIndicator(false), 2500);
        }
      })
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId, currentUserId, scrollToBottom, e2eKeys, groupMasterKey, isGroupClique, firePeerDeliveredAck]);
}
