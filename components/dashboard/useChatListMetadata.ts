'use client';

import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { getSupabaseClient } from '@/lib/supabase';
import { coerceMessageType } from '@/lib/chat/messages';
import { fetchInboxPreviews } from '@/lib/chat/inboxPreviews';
import { previewLabelForMessage } from '@/lib/chat/mediaMetadata';
import {
  deriveKeysForConnection,
  decryptContent,
  isEncrypted,
  decryptGroupMessageContent,
  isGroupMessageEncrypted,
} from '@/lib/chat/crypto';
import { unwrapGroupMasterKeyBytes } from '@/lib/chat/groupCliqueKey';
import { isActiveChatListStatus } from '@/lib/dashboard/connectionStatus';
import type { ConnectionRecord } from '@/components/dashboard/ConnectionTable';

export interface ChatListMetadata {
  preview: string | null;
  lastMessageAt: number | null;
  chatUpdatedAt: number | null;
}

/**
 * Chat-list previews and activity timestamps: the 30s inbox-preview poll,
 * the per-connection metadata load, and the verified-clique metadata load.
 * Extracted verbatim from DashboardView.
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
  const [chatMetadataByConnectionId, setChatMetadataByConnectionId] = useState<Record<string, ChatListMetadata>>({});
  const connectionMapRef = useRef<Map<string, ConnectionRecord>>(new Map());

  useEffect(() => {
    connectionMapRef.current = new Map(connectionRecords.map((connection) => [connection.id, connection]));
  }, [connectionRecords]);

  useEffect(() => {
    if (!user?.id || connectionRecords.length === 0) {
      chatConnectionMapRef.current = new Map();
      return;
    }

    const supabase = getSupabaseClient();
    if (!supabase) return;

    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const refreshInboxPreviews = async () => {
      if (cancelled) return;
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;

      const connectionIds = connectionRecords
        .filter(
          (connection) =>
            isActiveChatListStatus(connection.status) || connection.status === 'archived',
        )
        .map((connection) => connection.id);
      if (connectionIds.length === 0) return;

      try {
        const previews = await fetchInboxPreviews(supabase);
        if (cancelled) return;

        const connectionIdSet = new Set(connectionIds);
        const latestMessages = await Promise.all(
          previews
            .filter((row) => row.connection_id != null && connectionIdSet.has(row.connection_id))
            .map(async (row) => {
              const connectionId = row.connection_id as string;
              if (!row.last_message_id) {
                return {
                  connectionId,
                  preview: null as string | null,
                  lastMessageAt: null as number | null,
                  chatUpdatedAt: row.last_message_time_created,
                };
              }

              let raw: string = typeof row.last_message_content === 'string' ? row.last_message_content : '';
              const wasEncrypted = raw.length > 0 && isEncrypted(raw);
              let decryptFailed = false;
              if (wasEncrypted) {
                try {
                  const conn = connectionMapRef.current.get(connectionId);
                  if (conn?.userIds && conn.userIds.length >= 2) {
                    const keys = await deriveKeysForConnection(conn.id, conn.userIds);
                    raw = await decryptContent(raw, keys);
                  } else {
                    decryptFailed = true;
                    raw = '';
                  }
                } catch {
                  decryptFailed = true;
                  raw = '';
                }
              }

              const messageType = coerceMessageType(row.last_message_type);
              const preview =
                decryptFailed && messageType === 'text'
                  ? 'Tap to view message'
                  : previewLabelForMessage({
                      message_type: messageType,
                      content: raw,
                    });

              return {
                connectionId,
                preview,
                lastMessageAt:
                  typeof row.last_message_time_created === 'number' ? row.last_message_time_created : null,
                chatUpdatedAt:
                  typeof row.last_message_time_created === 'number' ? row.last_message_time_created : null,
              };
            }),
        );

        setChatMetadataByConnectionId((prev) => {
          const next = { ...prev };
          for (const entry of latestMessages) {
            next[entry.connectionId] = {
              preview: entry.preview,
              lastMessageAt: entry.lastMessageAt,
              chatUpdatedAt: entry.chatUpdatedAt,
            };
          }
          return next;
        });
      } catch (error) {
        console.error('Inbox preview poll error:', error);
      }
    };

    const primeChatMap = async () => {
      const connectionIds = connectionRecords.map((connection) => connection.id);
      if (connectionIds.length > 0) {
        const { data, error } = await supabase
          .from('chats')
          .select('id, connection_id')
          .in('connection_id', connectionIds);

        if (error) {
          console.error('Error priming chat map:', error.message || error);
        } else if (!cancelled) {
          chatConnectionMapRef.current = new Map(
            (data ?? []).map((chat: { id: string; connection_id: string }) => [
              String(chat.id),
              String(chat.connection_id),
            ]),
          );
        }
      }

      await refreshInboxPreviews();
    };

    void primeChatMap();
    intervalId = setInterval(() => {
      void refreshInboxPreviews();
    }, 30_000);

    const onVisibilityChange = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        void refreshInboxPreviews();
      }
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibilityChange);
    }

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibilityChange);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionRecords, user?.id]);

  useEffect(() => {
    if (!user?.id) {
      setChatMetadataByConnectionId({});
      return;
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      setChatMetadataByConnectionId({});
      return;
    }

    let cancelled = false;

    const loadChatMetadata = async () => {
      const connectionIds = connectionRecords
        .filter(
          (connection) =>
            isActiveChatListStatus(connection.status) || connection.status === 'archived',
        )
        .map((connection) => connection.id);

      if (connectionIds.length === 0) {
        return;
      }

      try {
        const previews = await fetchInboxPreviews(supabase);
        if (cancelled) return;

        const connectionIdSet = new Set(connectionIds);
        const latestMessages = await Promise.all(
          previews
            .filter((row) => row.connection_id != null && connectionIdSet.has(row.connection_id))
            .map(async (row) => {
              const connectionId = row.connection_id as string;
              if (!row.last_message_id) {
                return {
                  connectionId,
                  preview: null as string | null,
                  lastMessageAt: null as number | null,
                  chatUpdatedAt: row.last_message_time_created,
                };
              }

              let raw: string = typeof row.last_message_content === 'string' ? row.last_message_content : '';
              const wasEncrypted = raw.length > 0 && isEncrypted(raw);
              let decryptFailed = false;
              if (wasEncrypted) {
                try {
                  const conn = connectionMapRef.current.get(connectionId);
                  if (conn?.userIds && conn.userIds.length >= 2) {
                    const keys = await deriveKeysForConnection(conn.id, conn.userIds);
                    raw = await decryptContent(raw, keys);
                  } else {
                    decryptFailed = true;
                    raw = '';
                  }
                } catch {
                  decryptFailed = true;
                  raw = '';
                }
              }

              const messageType = coerceMessageType(row.last_message_type);
              let preview: string | null;
              if (decryptFailed && messageType === 'text') {
                preview = 'Tap to view message';
              } else {
                preview = previewLabelForMessage({
                  message_type: messageType,
                  content: raw,
                });
              }

              return {
                connectionId,
                preview,
                lastMessageAt:
                  typeof row.last_message_time_created === 'number' ? row.last_message_time_created : null,
                chatUpdatedAt:
                  typeof row.last_message_time_created === 'number' ? row.last_message_time_created : null,
              };
            }),
        );

        setChatMetadataByConnectionId((prev) => {
          const next = { ...prev };
          for (const entry of latestMessages) {
            next[entry.connectionId] = {
              preview: entry.preview,
              lastMessageAt: entry.lastMessageAt,
              chatUpdatedAt: entry.chatUpdatedAt,
            };
          }
          return next;
        });
      } catch (error) {
        console.error('Unexpected chat metadata load error:', error);
      }
    };

    loadChatMetadata();

    return () => {
      cancelled = true;
    };
  }, [connectionRecords, selectedConnection, user?.id]);

  useEffect(() => {
    if (!user?.id || groupCliqueRecords.length === 0) {
      return;
    }
    const supabase = getSupabaseClient();
    if (!supabase) return;

    let cancelled = false;

    const loadGroupChatMetadata = async () => {
      try {
        const entries = await Promise.all(
          groupCliqueRecords.map(async (row) => {
            const chatId = row.groupChatId;
            if (!chatId) {
              return {
                groupId: row.id,
                preview: null as string | null,
                lastMessageAt: null as number | null,
                chatUpdatedAt: null as number | null,
              };
            }
            const { data: chatRow } = await supabase
              .from('chats')
              .select('updated_at')
              .eq('id', chatId)
              .maybeSingle();
            const { data: message, error: messageError } = await supabase
              .from('messages')
              .select('content, time_created, message_type')
              .eq('chat_id', chatId)
              .order('time_created', { ascending: false })
              .limit(1)
              .maybeSingle();

            if (messageError) {
              return {
                groupId: row.id,
                preview: null,
                lastMessageAt: null,
                chatUpdatedAt:
                  typeof (chatRow as { updated_at?: number } | null)?.updated_at === 'number'
                    ? (chatRow as { updated_at: number }).updated_at
                    : null,
              };
            }

            if (!message) {
              return {
                groupId: row.id,
                preview: null,
                lastMessageAt: null,
                chatUpdatedAt:
                  typeof (chatRow as { updated_at?: number } | null)?.updated_at === 'number'
                    ? (chatRow as { updated_at: number }).updated_at
                    : null,
              };
            }

            let raw: string = typeof message.content === 'string' ? message.content : '';
            let decryptFailed = false;
            if (raw.length > 0 && isGroupMessageEncrypted(raw)) {
              try {
                const master = await unwrapGroupMasterKeyBytes(supabase, {
                  groupId: row.id,
                  viewerUserId: user.id,
                });
                if (master) {
                  raw = await decryptGroupMessageContent(raw, master);
                } else {
                  decryptFailed = true;
                  raw = '';
                }
              } catch {
                decryptFailed = true;
                raw = '';
              }
            }

            const messageType = coerceMessageType(message.message_type);
            let preview: string | null;
            if (decryptFailed && messageType === 'text') {
              preview = 'Tap to view message';
            } else {
              preview = previewLabelForMessage({
                message_type: messageType,
                content: raw,
              });
            }

            return {
              groupId: row.id,
              preview,
              lastMessageAt: typeof message.time_created === 'number' ? message.time_created : null,
              chatUpdatedAt:
                typeof (chatRow as { updated_at?: number } | null)?.updated_at === 'number'
                  ? (chatRow as { updated_at: number }).updated_at
                  : null,
            };
          }),
        );

        if (cancelled) return;

        setChatMetadataByConnectionId((prev) => {
          const next = { ...prev };
          for (const e of entries) {
            next[e.groupId] = {
              preview: e.preview,
              lastMessageAt: e.lastMessageAt,
              chatUpdatedAt: e.chatUpdatedAt,
            };
          }
          return next;
        });
      } catch (error) {
        console.error('Unexpected group chat metadata load error:', error);
      }
    };

    void loadGroupChatMetadata();

    return () => {
      cancelled = true;
    };
  }, [groupCliqueRecords, user?.id]);

  return { chatMetadataByConnectionId };
}
