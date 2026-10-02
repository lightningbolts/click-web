import type { SupabaseClient } from '@supabase/supabase-js';
import type { Message, MessageType } from '@/lib/chat/types';
import { previewLabelForMessage } from '@/lib/chat/mediaMetadata';
import { shouldSkipChatDecrypt } from '@/lib/chat/messages';
import {
  decryptContent,
  decryptGroupMessageContent,
  deriveKeysForConnection,
  isEncrypted,
  isEncryptedWireContent,
  isGroupMessageEncrypted,
} from '@/lib/chat/crypto';
import { unwrapGroupMasterKeyBytes } from '@/lib/chat/groupCliqueKey';
import { decryptWebE2eeV2Message, resolveWebE2eeV2Session } from '@/lib/chat/e2eeV2Client';
import { getFreshAuthHeaders } from '@/lib/auth/freshAuthHeaders';

export type InboxPreviewRow = {
  chat_id: string;
  connection_id: string | null;
  last_message_id: string | null;
  last_message_user_id: string | null;
  last_message_content: string | null;
  last_message_time_created: number | null;
  last_message_type: string | null;
  last_message_metadata: Record<string, unknown> | null;
  last_message_is_read: boolean;
  unread_count: number;
};

function coercePreviewRow(raw: Record<string, unknown>): InboxPreviewRow | null {
  const chatId = typeof raw.chat_id === 'string' ? raw.chat_id : null;
  if (!chatId) return null;
  return {
    chat_id: chatId,
    connection_id: typeof raw.connection_id === 'string' ? raw.connection_id : null,
    last_message_id: typeof raw.last_message_id === 'string' ? raw.last_message_id : null,
    last_message_user_id:
      typeof raw.last_message_user_id === 'string' ? raw.last_message_user_id : null,
    last_message_content:
      typeof raw.last_message_content === 'string' ? raw.last_message_content : null,
    last_message_time_created:
      typeof raw.last_message_time_created === 'number' && Number.isFinite(raw.last_message_time_created)
        ? raw.last_message_time_created
        : null,
    last_message_type: typeof raw.last_message_type === 'string' ? raw.last_message_type : null,
    last_message_metadata:
      raw.last_message_metadata != null &&
      typeof raw.last_message_metadata === 'object' &&
      !Array.isArray(raw.last_message_metadata)
        ? (raw.last_message_metadata as Record<string, unknown>)
        : null,
    last_message_is_read: Boolean(raw.last_message_is_read),
    unread_count:
      typeof raw.unread_count === 'number' && Number.isFinite(raw.unread_count)
        ? raw.unread_count
        : 0,
  };
}

/**
 * Batch inbox preview + unread counts for direct (connection) chats via `get_inbox_previews` RPC.
 */
export async function fetchInboxPreviews(
  supabase: SupabaseClient,
): Promise<InboxPreviewRow[]> {
  const { data, error } = await supabase.rpc('get_inbox_previews');
  if (error) {
    throw new Error(error.message);
  }
  if (!Array.isArray(data)) return [];
  return data
    .map((row) => coercePreviewRow(row as Record<string, unknown>))
    .filter((row): row is InboxPreviewRow => row != null);
}

// ── Preview text ───────────────────────────────────────────────────────────

/** Row label when the content cannot be read on this device (matches iOS `InboxFormatting`). */
export const UNREADABLE_PREVIEW_LABEL = 'Message';

/**
 * One-line inbox preview from already-decrypted text (or `null` when this device could not
 * decrypt). Never returns wire ciphertext: undecryptable text becomes a neutral label.
 */
export function inboxPreviewText(input: {
  messageType: MessageType;
  plaintext: string | null;
  metadata?: Message['metadata'] | null;
  senderPrefix?: string | null;
}): string {
  const { messageType, plaintext } = input;
  let label: string;
  if (messageType === 'text' && plaintext == null) {
    label = UNREADABLE_PREVIEW_LABEL;
  } else {
    label = previewLabelForMessage({
      message_type: messageType,
      content: plaintext ?? '',
      metadata: (input.metadata ?? undefined) as Message['metadata'] | undefined,
    });
    if (label === 'Encrypted message') label = UNREADABLE_PREVIEW_LABEL;
  }
  const flat = label.replace(/\s+/g, ' ').trim();
  return input.senderPrefix ? `${input.senderPrefix}${flat}` : flat;
}

// ── Client-side preview decryption ─────────────────────────────────────────

type PreviewScope =
  | { kind: 'direct'; chatId: string | null; connectionId: string; participantUserIds: string[] }
  | { kind: 'group'; chatId: string | null; groupId: string; viewerUserId: string; participantUserIds: string[] };

/** Chats whose v2 session could not be resolved recently; avoids re-requesting on every poll. */
const v2Unavailable = new Map<string, number>();
const V2_RETRY_MS = 60_000;
const groupMasterByGroup = new Map<string, Promise<ArrayBuffer | null>>();

function groupMaster(supabase: SupabaseClient, groupId: string, viewerUserId: string) {
  const key = `${viewerUserId}:${groupId}`;
  let pending = groupMasterByGroup.get(key);
  if (!pending) {
    pending = unwrapGroupMasterKeyBytes(supabase, { groupId, viewerUserId }).catch(() => null);
    groupMasterByGroup.set(key, pending);
    // A failed unwrap may succeed after a key rotation; allow a later retry.
    void pending.then((value) => {
      if (value == null) groupMasterByGroup.delete(key);
    });
  }
  return pending;
}

/**
 * Decrypts a conversation's latest message for its inbox row, entirely on this device and
 * with the same key paths the thread uses (v2 epoch keys, v1 pairwise keys, group master).
 * Returns `null` when the content is encrypted and this device cannot read it.
 */
export async function decryptInboxPreviewContent(
  supabase: SupabaseClient,
  content: string | null | undefined,
  messageType: MessageType,
  scope: PreviewScope,
): Promise<string | null> {
  const raw = typeof content === 'string' ? content : '';
  if (!raw || shouldSkipChatDecrypt(messageType) || !isEncryptedWireContent(raw)) return raw;
  try {
    if (raw.startsWith('e2e2:')) {
      if (!scope.chatId) return null;
      const blockedAt = v2Unavailable.get(scope.chatId);
      if (blockedAt && Date.now() - blockedAt < V2_RETRY_MS) return null;
      const session = await resolveWebE2eeV2Session({
        chatId: scope.chatId,
        participantUserIds: scope.participantUserIds,
        getAuthHeaders: getFreshAuthHeaders,
      }).catch(() => null);
      if (!session) {
        v2Unavailable.set(scope.chatId, Date.now());
        return null;
      }
      return await decryptWebE2eeV2Message(session, raw);
    }
    if (scope.kind === 'group' && isGroupMessageEncrypted(raw)) {
      const master = await groupMaster(supabase, scope.groupId, scope.viewerUserId);
      return master ? await decryptGroupMessageContent(raw, master) : null;
    }
    if (scope.kind === 'direct' && isEncrypted(raw) && scope.participantUserIds.length >= 2) {
      const keys = await deriveKeysForConnection(scope.connectionId, scope.participantUserIds);
      return await decryptContent(raw, keys);
    }
  } catch {
    return null;
  }
  return null;
}
