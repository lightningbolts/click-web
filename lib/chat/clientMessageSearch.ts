import { highlightedMessageSnippet, type ChatSearchHit } from '@/lib/chat/searchSnippet';
import { isBeaconChatMessage, normalizeDbMessage, shouldSkipChatDecrypt } from '@/lib/chat/messages';
import {
  decryptContent,
  decryptGroupMessageContent,
  isEncrypted,
  isGroupMessageEncrypted,
  type DerivedKeys,
} from '@/lib/chat/crypto';
import { unwrapGroupMasterKeyBytes } from '@/lib/chat/groupCliqueKey';
import { getSupabaseClient } from '@/lib/supabase';
import type { Message } from '@/lib/chat/types';

const SEARCH_PAGE = 40;
const MAX_SCOPES = 12;
const CONCURRENCY = 3;

export type ClientMessageSearchScope = {
  connectionId: string;
  chatId: string;
  name: string;
  isGroup: boolean;
  userIds?: string[];
  currentUserId: string;
};

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return out;
}

async function decryptMessage(
  message: Message,
  scope: ClientMessageSearchScope,
  pairwiseKeys: DerivedKeys | null,
  groupMaster: ArrayBuffer | null,
): Promise<Message> {
  if (shouldSkipChatDecrypt(message.message_type) || isBeaconChatMessage(message)) return message;
  if (scope.isGroup && groupMaster && isGroupMessageEncrypted(message.content)) {
    return { ...message, content: await decryptGroupMessageContent(message.content, groupMaster) };
  }
  if (!scope.isGroup && pairwiseKeys && isEncrypted(message.content)) {
    return { ...message, content: await decryptContent(message.content, pairwiseKeys) };
  }
  return message;
}

/**
 * Fetch a recent page per conversation and match [query] against decrypted plaintext.
 * Complements GET /api/chat/search, which can only ilike ciphertext-free rows.
 */
export async function searchDecryptedRecentMessages(args: {
  query: string;
  getAuthHeaders: () => Promise<HeadersInit>;
  scopes: ClientMessageSearchScope[];
  derivePairwiseKeys: (connectionId: string, userIds: string[]) => Promise<DerivedKeys>;
}): Promise<ChatSearchHit[]> {
  const needle = args.query.trim().toLowerCase();
  if (needle.length < 2) return [];
  const scopes = args.scopes.filter((s) => s.chatId).slice(0, MAX_SCOPES);
  const supabase = getSupabaseClient();

  const batches = await mapPool(scopes, CONCURRENCY, async (scope) => {
    try {
      const headers = await args.getAuthHeaders();
      const params = new URLSearchParams({ chatId: scope.chatId, limit: String(SEARCH_PAGE) });
      const res = await fetch(`/api/chat/messages?${params}`, { headers });
      const json = (await res.json().catch(() => ({}))) as {
        messages?: Record<string, unknown>[];
      };
      if (!res.ok) return [] as ChatSearchHit[];
      const raw: Message[] = (json.messages ?? []).reverse().map(normalizeDbMessage);

      let pairwiseKeys: DerivedKeys | null = null;
      let groupMaster: ArrayBuffer | null = null;
      if (scope.isGroup && supabase) {
        groupMaster = await unwrapGroupMasterKeyBytes(supabase, {
          groupId: scope.connectionId,
          viewerUserId: scope.currentUserId,
        });
      } else if (!scope.isGroup && scope.userIds && scope.userIds.length >= 2) {
        pairwiseKeys = await args.derivePairwiseKeys(scope.connectionId, scope.userIds);
      }

      const hits: ChatSearchHit[] = [];
      for (const message of raw) {
        const decrypted = await decryptMessage(message, scope, pairwiseKeys, groupMaster);
        if (!decrypted.content.toLowerCase().includes(needle)) continue;
        hits.push({
          messageId: decrypted.id,
          chatId: scope.chatId,
          conversationId: scope.connectionId,
          connectionId: scope.connectionId,
          senderId: decrypted.user_id,
          timestamp: decrypted.time_created,
          snippet: highlightedMessageSnippet(decrypted.content, args.query),
          chatName: scope.name,
          isHub: false,
        });
      }
      return hits;
    } catch {
      return [] as ChatSearchHit[];
    }
  });

  const merged = new Map<string, ChatSearchHit>();
  for (const hit of batches.flat()) {
    merged.set(hit.messageId, hit);
  }
  return [...merged.values()].sort((a, b) => b.timestamp - a.timestamp);
}

export { mergeChatSearchHits } from '@/lib/chat/searchSnippet';
