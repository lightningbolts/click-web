'use client';

import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import { getSupabaseClient } from '@/lib/supabase';
import { coerceMessageType, coerceMetadata } from '@/lib/chat/messages';
import {
  decryptInboxPreviewContent,
  fetchInboxPreviews,
  inboxPreviewText,
  type InboxPreviewRow,
} from '@/lib/chat/inboxPreviews';
import { isActiveChatListStatus } from '@/lib/dashboard/connectionStatus';
import { useSessionCachedState } from '@/lib/dashboard/sessionCache';
import type { ConnectionRecord } from '@/components/dashboard/ConnectionTable';

export interface ChatListMetadata {
  preview: string | null;
  lastMessageAt: number | null;
  chatUpdatedAt: number | null;
  /** Unread incoming messages (direct chats; from `get_inbox_previews`). */
  unreadCount?: number;
  /** `chats.id` for the conversation, when known (mutes and pins are keyed by it). */
  chatId?: string | null;
}

const POLL_MS = 30_000;

function participantIds(connection: ConnectionRecord | undefined, viewerId: string): string[] {
  if (!connection) return [];
  if (connection.userIds?.length) return connection.userIds;
  return connection.otherUserId ? [viewerId, connection.otherUserId] : [];
}

/**
 * Chat-list previews, unread counts, and activity timestamps.
 *
 * Direct chats come from the `get_inbox_previews` RPC; verified cliques read their latest
 * message. Every preview is decrypted on this device through `decryptInboxPreviewContent`
 * (v2 epoch keys, v1 pairwise keys, or the group master key). The server never sees
 * plaintext, and ciphertext never reaches a row: unreadable content becomes "Message".
 */
export function useChatListMetadata({
  user,
  connectionRecords,
  selectedConnection,
  groupCliqueRecords,
  chatConnectionMapRef,
}: {
  user: any;
  connectionRecords: ConnectionRecord[];
  selectedConnection: ConnectionRecord | null;
  groupCliqueRecords: ConnectionRecord[];
  chatConnectionMapRef: MutableRefObject<Map<string, string>>;
}) {
  const viewerId: string | undefined = user?.id;
  const [chatMetadataByConnectionId, setChatMetadataByConnectionId] = useSessionCachedState<
    Record<string, ChatListMetadata>
  >(viewerId, 'chatMetadata', {});
  /** A first pass finished (either way), so rows can show with their previews in final order. */
  const [directPreviewsLoaded, setDirectPreviewsLoaded] = useSessionCachedState(viewerId, 'directPreviewsLoaded', false);
  const [groupPreviewsLoaded, setGroupPreviewsLoaded] = useSessionCachedState(viewerId, 'groupPreviewsLoaded', false);
  const connectionMapRef = useRef<Map<string, ConnectionRecord>>(new Map());
  /** Bumped per refresh so a slower earlier pass never overwrites a newer one. */
  const directGenerationRef = useRef(0);

  useEffect(() => {
    connectionMapRef.current = new Map(connectionRecords.map((connection) => [connection.id, connection]));
  }, [connectionRecords]);

  const directConnectionIds = useCallback(
    () =>
      new Set(
        connectionRecords
          .filter((c) => isActiveChatListStatus(c.status) || c.status === 'archived')
          .map((c) => c.id),
      ),
    [connectionRecords],
  );

  const previewForDirectRow = useCallback(
    async (row: InboxPreviewRow): Promise<[string, ChatListMetadata] | null> => {
      const supabase = getSupabaseClient();
      if (!supabase || !viewerId || !row.connection_id) return null;
      const connectionId = row.connection_id;
      const base = {
        lastMessageAt: row.last_message_id ? row.last_message_time_created : null,
        chatUpdatedAt: row.last_message_time_created,
        unreadCount: row.unread_count,
        chatId: row.chat_id,
      };
      if (!row.last_message_id) return [connectionId, { ...base, preview: null }];
      const messageType = coerceMessageType(row.last_message_type);
      const plaintext = await decryptInboxPreviewContent(supabase, row.last_message_content, messageType, {
        kind: 'direct',
        chatId: row.chat_id,
        connectionId,
        participantUserIds: participantIds(connectionMapRef.current.get(connectionId), viewerId),
      });
      const preview = inboxPreviewText({
        messageType,
        plaintext,
        metadata: coerceMetadata(row.last_message_metadata),
      });
      return [connectionId, { ...base, preview }];
    },
    [viewerId],
  );

  const refreshDirectPreviews = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase || !viewerId) return;
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
    const wanted = directConnectionIds();
    if (wanted.size === 0) return;
    const generation = ++directGenerationRef.current;
    try {
      const rows = await fetchInboxPreviews(supabase);
      const entries = await Promise.all(
        rows.filter((r) => r.connection_id && wanted.has(r.connection_id)).map(previewForDirectRow),
      );
      if (generation !== directGenerationRef.current) return;
      setChatMetadataByConnectionId((prev) => {
        const next = { ...prev };
        for (const entry of entries) {
          if (entry) next[entry[0]] = entry[1];
        }
        return next;
      });
    } catch (error) {
      console.error('Inbox preview refresh error:', error);
    } finally {
      if (generation === directGenerationRef.current) setDirectPreviewsLoaded(true);
    }
  }, [directConnectionIds, previewForDirectRow, setChatMetadataByConnectionId, setDirectPreviewsLoaded, viewerId]);

  // Direct chats: refresh now (alongside priming the chat→connection map, which only realtime and
  // search read), every 30s, and on focus.
  useEffect(() => {
    if (!viewerId || connectionRecords.length === 0) {
      chatConnectionMapRef.current = new Map();
      return;
    }
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let cancelled = false;

    void refreshDirectPreviews();
    void (async () => {
      const { data, error } = await supabase
        .from('chats')
        .select('id, connection_id')
        .in('connection_id', connectionRecords.map((c) => c.id));
      if (error) {
        console.error('Error priming chat map:', error.message || error);
      } else if (!cancelled) {
        chatConnectionMapRef.current = new Map(
          (data ?? []).map((chat: { id: string; connection_id: string }) => [String(chat.id), String(chat.connection_id)]),
        );
      }
    })();

    const intervalId = setInterval(() => void refreshDirectPreviews(), POLL_MS);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void refreshDirectPreviews();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [chatConnectionMapRef, connectionRecords, refreshDirectPreviews, viewerId]);

  // Leaving or switching a thread usually means something was just sent or read.
  const selectedId = selectedConnection?.id ?? null;
  useEffect(() => {
    if (!viewerId || !selectedId) return;
    return () => {
      void refreshDirectPreviews();
    };
  }, [refreshDirectPreviews, selectedId, viewerId]);

  // Realtime: one RLS-scoped INSERT subscription for the whole inbox. New rows refresh the
  // affected previews (debounced); the rows themselves are decrypted by the same path above.
  const [groupRefreshNonce, setGroupRefreshNonce] = useState(0);
  const groupChatIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    groupChatIdsRef.current = new Set(
      groupCliqueRecords.map((g) => g.groupChatId).filter((id): id is string => Boolean(id)),
    );
  }, [groupCliqueRecords]);
  const refreshDirectRef = useRef(refreshDirectPreviews);
  useEffect(() => {
    refreshDirectRef.current = refreshDirectPreviews;
  }, [refreshDirectPreviews]);
  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase || !viewerId) return;
    let directTimer: ReturnType<typeof setTimeout> | null = null;
    let groupTimer: ReturnType<typeof setTimeout> | null = null;
    const channel = supabase
      .channel(`inbox-previews:${viewerId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload: { new?: { chat_id?: unknown } }) => {
          const chatId = typeof payload.new?.chat_id === 'string' ? payload.new.chat_id : '';
          if (!chatId) return;
          if (groupChatIdsRef.current.has(chatId)) {
            if (groupTimer) clearTimeout(groupTimer);
            groupTimer = setTimeout(() => setGroupRefreshNonce((n) => n + 1), 400);
            return;
          }
          if (directTimer) clearTimeout(directTimer);
          directTimer = setTimeout(() => void refreshDirectRef.current(), 400);
        },
      )
      .subscribe();
    return () => {
      if (directTimer) clearTimeout(directTimer);
      if (groupTimer) clearTimeout(groupTimer);
      void supabase.removeChannel(channel);
    };
  }, [viewerId]);

  // Verified cliques: latest message per group chat.
  useEffect(() => {
    if (!viewerId || groupCliqueRecords.length === 0) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let cancelled = false;

    void (async () => {
      try {
        const entries = await Promise.all(
          groupCliqueRecords.map(async (group): Promise<[string, ChatListMetadata]> => {
            const chatId = group.groupChatId ?? null;
            if (!chatId) return [group.id, { preview: null, lastMessageAt: null, chatUpdatedAt: null, chatId: null }];
            const [{ data: chatRow }, { data: message, error: messageError }] = await Promise.all([
              supabase.from('chats').select('updated_at').eq('id', chatId).maybeSingle(),
              supabase
                .from('messages')
                .select('content, time_created, message_type, metadata, user_id')
                .eq('chat_id', chatId)
                .order('time_created', { ascending: false })
                .limit(1)
                .maybeSingle(),
            ]);
            const updatedAt = (chatRow as { updated_at?: unknown } | null)?.updated_at;
            const chatUpdatedAt = typeof updatedAt === 'number' ? updatedAt : null;
            if (messageError || !message) {
              return [group.id, { preview: null, lastMessageAt: null, chatUpdatedAt, chatId }];
            }
            const messageType = coerceMessageType(message.message_type);
            const plaintext = await decryptInboxPreviewContent(supabase, message.content, messageType, {
              kind: 'group',
              chatId,
              groupId: group.id,
              viewerUserId: viewerId,
              participantUserIds: group.userIds ?? [],
            });
            const preview = inboxPreviewText({
              messageType,
              plaintext,
              metadata: coerceMetadata(message.metadata),
              senderPrefix: message.user_id === viewerId ? 'You: ' : null,
            });
            return [
              group.id,
              {
                preview,
                lastMessageAt: typeof message.time_created === 'number' ? message.time_created : null,
                chatUpdatedAt,
                chatId,
              },
            ];
          }),
        );
        if (cancelled) return;
        setChatMetadataByConnectionId((prev) => {
          const next = { ...prev };
          for (const [id, meta] of entries) next[id] = meta;
          return next;
        });
      } catch (error) {
        console.error('Unexpected group chat metadata load error:', error);
      } finally {
        if (!cancelled) setGroupPreviewsLoaded(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [groupCliqueRecords, groupRefreshNonce, setChatMetadataByConnectionId, setGroupPreviewsLoaded, viewerId]);

  return { chatMetadataByConnectionId, refreshDirectPreviews, directPreviewsLoaded, groupPreviewsLoaded };
}
