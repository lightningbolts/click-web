'use client';

import { useEffect, useState, type MutableRefObject } from 'react';
import { deriveKeysForConnection } from '@/lib/chat/crypto';
import { searchDecryptedRecentMessages } from '@/lib/chat/clientMessageSearch';
import { mergeChatSearchHits, type ChatSearchHit } from '@/lib/chat/searchSnippet';
import type { ConnectionRecord } from '@/components/dashboard/ConnectionTable';

/**
 * Debounced chat search across server hits and locally-decrypted recent
 * messages. Extracted verbatim from DashboardView.
 */
export function useChatSearch({
  user,
  getAuthHeaders,
  connectionRecords,
  groupCliqueRecords,
  chatConnectionMapRef,
}: {
  user: any;
  getAuthHeaders: () => Promise<HeadersInit>;
  connectionRecords: ConnectionRecord[];
  groupCliqueRecords: ConnectionRecord[];
  chatConnectionMapRef: MutableRefObject<Map<string, string>>;
}) {
  const [chatSearchQuery, setChatSearchQuery] = useState('');
  const [chatSearchHits, setChatSearchHits] = useState<ChatSearchHit[]>([]);
  const [chatSearchBusy, setChatSearchBusy] = useState(false);

  useEffect(() => {
    const q = chatSearchQuery.trim();
    if (q.length < 2 || !user?.id) {
      setChatSearchHits([]);
      setChatSearchBusy(false);
      return;
    }
    let cancelled = false;
    setChatSearchBusy(true);
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const headers = await getAuthHeaders();
          const res = await fetch(`/api/chat/search?q=${encodeURIComponent(q)}`, { headers });
          const json = (await res.json().catch(() => ({}))) as { hits?: ChatSearchHit[] };
          const serverHits = Array.isArray(json.hits) ? json.hits.filter((hit) => !hit.isHub) : [];

          const connectionToChatId = new Map<string, string>();
          for (const [chatId, connectionId] of chatConnectionMapRef.current) {
            connectionToChatId.set(connectionId, chatId);
          }
          const scopes = [...connectionRecords, ...groupCliqueRecords].flatMap((c) => {
            const chatId =
              c.chatKind === 'group_clique' ? c.groupChatId : connectionToChatId.get(c.id);
            if (!chatId) return [];
            return [
              {
                connectionId: c.id,
                chatId,
                name: c.name,
                isGroup: c.chatKind === 'group_clique',
                userIds: c.userIds,
                currentUserId: user.id as string,
              },
            ];
          });

          const clientHits = await searchDecryptedRecentMessages({
            query: q,
            getAuthHeaders,
            scopes,
            derivePairwiseKeys: deriveKeysForConnection,
          });
          if (!cancelled) {
            setChatSearchHits(mergeChatSearchHits(serverHits, clientHits).slice(0, 24));
          }
        } catch {
          if (!cancelled) setChatSearchHits([]);
        } finally {
          if (!cancelled) setChatSearchBusy(false);
        }
      })();
    }, 280);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatSearchQuery, connectionRecords, getAuthHeaders, groupCliqueRecords, user?.id]);

  return { chatSearchQuery, setChatSearchQuery, chatSearchHits, chatSearchBusy };
}
