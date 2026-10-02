import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { assertChatWritable } from '@/lib/server/chatGatekeeper';
import { chatDropRevealAtMs } from '@/lib/drops/developState';
import { dropObjectPrefix, isOwnedDropPath, removeDropObjects } from '@/lib/server/drops/storage';
import type { ResolvedDrop } from '@/lib/server/drops/develop';

/**
 * Gated chat drops. The sender uploads the E2EE pixelated preview as the message's normal media and
 * the E2EE original through `/api/chat/media` with `drop_original: true`, which lands in the private
 * bucket. The message then names that path once, in `metadata.drop_original_path`; the server moves
 * it into `chat_drop_originals` and strips it from the stored metadata, so no client can sign the
 * original before `reveal_at`.
 */

export function chatDropOriginalPrefix(chatId: string, userId: string): string {
  return dropObjectPrefix('chat', chatId, userId);
}

export type GatedChatDrop = { metadata: Record<string, unknown>; originalPath: string | null };

/**
 * Splits the gated-original path out of outgoing message metadata. Returns an error string when the
 * message claims a gated original it can't have (wrong owner/chat, not a Click Drop photo).
 */
export function extractGatedChatDrop(params: {
  metadata: Record<string, unknown>;
  messageType: string;
  chatId: string;
  userId: string;
}): GatedChatDrop | { error: string } {
  const { metadata, messageType, chatId, userId } = params;
  if (!('drop_original_path' in metadata)) return { metadata, originalPath: null };
  const { drop_original_path: path, ...rest } = metadata;
  if (metadata.disposable_roll !== true || messageType !== 'image') {
    return { error: 'drop_original_path is only valid on Click Drop photos' };
  }
  if (!isOwnedDropPath(path, chatDropOriginalPrefix(chatId, userId))) {
    return { error: 'Invalid drop_original_path' };
  }
  return { metadata: { ...rest, drop_gated: true }, originalPath: path };
}

export async function registerChatDropOriginal(
  admin: SupabaseClient,
  row: { messageId: string; chatId: string; senderId: string; originalPath: string; revealAtIso: string },
): Promise<{ error: string } | null> {
  const { error } = await admin.from('chat_drop_originals').insert({
    message_id: row.messageId,
    chat_id: row.chatId,
    sender_id: row.senderId,
    object_path: row.originalPath,
    reveal_at: row.revealAtIso,
  });
  return error ? { error: error.message } : null;
}

/** The gated original behind a message, if any (read before a delete cascades the registry row). */
export async function chatDropOriginalPath(admin: SupabaseClient, messageId: string): Promise<string | null> {
  const { data } = await admin
    .from('chat_drop_originals')
    .select('object_path')
    .eq('message_id', messageId)
    .maybeSingle();
  return (data as { object_path?: string } | null)?.object_path ?? null;
}

export async function removeChatDropOriginal(admin: SupabaseClient, path: string | null): Promise<void> {
  if (path) await removeDropObjects(admin, [path]);
}

type MessageRow = { id: string; chat_id: string; metadata: unknown };
type RegistryRow = { message_id: string; object_path: string; reveal_at: string };

/**
 * Chat drops this viewer may develop: Click Drop messages in chats they can read. Gated drops use
 * the registry's reveal time; legacy drops (original already in the message) use metadata and have
 * no original to sign — developing them only records the viewer's state.
 */
export async function resolveChatDrops(
  admin: SupabaseClient,
  viewerId: string,
  ids: string[],
): Promise<Map<string, ResolvedDrop>> {
  const out = new Map<string, ResolvedDrop>();
  if (ids.length === 0) return out;
  const [messagesRes, registryRes] = await Promise.all([
    admin.from('messages').select('id, chat_id, metadata').in('id', ids),
    admin.from('chat_drop_originals').select('message_id, object_path, reveal_at').in('message_id', ids),
  ]);
  if (messagesRes.error || registryRes.error) {
    console.error('[drops] resolve chat:', messagesRes.error?.message ?? registryRes.error?.message);
    return out;
  }
  const messages = (messagesRes.data ?? []) as MessageRow[];
  const registry = new Map(((registryRes.data ?? []) as RegistryRow[]).map((r) => [r.message_id, r]));

  const chatIds = [...new Set(messages.map((m) => String(m.chat_id)))];
  const allowed = new Set<string>();
  await Promise.all(
    chatIds.map(async (chatId) => {
      if (!(await assertChatWritable(admin, viewerId, chatId))) allowed.add(chatId);
    }),
  );

  for (const message of messages) {
    if (!allowed.has(String(message.chat_id))) continue;
    const gated = registry.get(message.id);
    const revealAtMs = gated ? Date.parse(gated.reveal_at) : chatDropRevealAtMs(message.metadata);
    if (revealAtMs == null || !Number.isFinite(revealAtMs)) continue;
    out.set(message.id, { revealAtMs, originalPath: gated?.object_path ?? null });
  }
  return out;
}
