import type { SupabaseClient } from '@supabase/supabase-js';
import { sendPush, userAllowsPush } from '@/lib/nudges/moments';

/**
 * Batched "ready to develop" push for gated Click Drops (spec §2): once per recipient per sweep,
 * however many drops became ready, and never for drops that became ready long ago (a late push for
 * an old drop is noise — those are marked handled silently).
 */

export const DROP_READY_STALE_MS = 12 * 60 * 60 * 1000;
const SWEEP_LIMIT = 500;

export type ReadyChatDrop = { messageId: string; chatId: string; revealAtMs: number };

/** recipient → the ready drops they can see (each chat's participants, sender included). */
export function groupReadyDropsByRecipient(
  drops: ReadyChatDrop[],
  participantsByChat: Map<string, string[]>,
  mutedChatsByUser: Map<string, Set<string>>,
): Map<string, ReadyChatDrop[]> {
  const out = new Map<string, ReadyChatDrop[]>();
  for (const drop of drops) {
    for (const userId of participantsByChat.get(drop.chatId) ?? []) {
      if (mutedChatsByUser.get(userId)?.has(drop.chatId)) continue;
      out.set(userId, [...(out.get(userId) ?? []), drop]);
    }
  }
  return out;
}

export function dropReadyCopy(count: number): { title: string; body: string } {
  return {
    title: 'Click Drops',
    body:
      count === 1
        ? 'Your Click Drop from yesterday is ready to develop.'
        : `${count} Click Drops from yesterday are ready to develop.`,
  };
}

async function chatParticipants(admin: SupabaseClient, chatIds: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (chatIds.length === 0) return out;
  const { data: chats, error } = await admin.from('chats').select('id, connection_id, group_id').in('id', chatIds);
  if (error) throw new Error(`drops-ready chats: ${error.message}`);
  const rows = (chats ?? []) as Array<{ id: string; connection_id: string | null; group_id: string | null }>;
  const connectionIds = rows.flatMap((r) => (r.connection_id ? [r.connection_id] : []));
  const groupIds = rows.flatMap((r) => (r.group_id ? [r.group_id] : []));
  const [connections, members] = await Promise.all([
    connectionIds.length
      ? admin.from('connections').select('id, user_ids').in('id', connectionIds)
      : Promise.resolve({ data: [], error: null }),
    groupIds.length
      ? admin.from('group_members').select('group_id, user_id').in('group_id', groupIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (connections.error || members.error) {
    throw new Error(`drops-ready participants: ${connections.error?.message ?? members.error?.message}`);
  }
  const usersByConnection = new Map(
    ((connections.data ?? []) as Array<{ id: string; user_ids: string[] | null }>).map((c) => [c.id, c.user_ids ?? []]),
  );
  const usersByGroup = new Map<string, string[]>();
  for (const m of (members.data ?? []) as Array<{ group_id: string; user_id: string }>) {
    usersByGroup.set(m.group_id, [...(usersByGroup.get(m.group_id) ?? []), m.user_id]);
  }
  for (const chat of rows) {
    const ids = chat.group_id ? usersByGroup.get(chat.group_id) : usersByConnection.get(chat.connection_id ?? '');
    out.set(chat.id, [...new Set((ids ?? []).map((id) => id.trim()).filter(Boolean))]);
  }
  return out;
}

async function activeMutes(admin: SupabaseClient, userIds: string[], nowIso: string): Promise<Map<string, Set<string>>> {
  const out = new Map<string, Set<string>>();
  if (userIds.length === 0) return out;
  const { data, error } = await admin
    .from('chat_mutes')
    .select('user_id, chat_id, muted_until')
    .in('user_id', userIds);
  if (error) {
    console.warn('[drops-ready] mutes:', error.message);
    return out;
  }
  for (const row of (data ?? []) as Array<{ user_id: string; chat_id: string; muted_until: string | null }>) {
    if (row.muted_until != null && row.muted_until <= nowIso) continue;
    out.set(row.user_id, (out.get(row.user_id) ?? new Set()).add(row.chat_id));
  }
  return out;
}

export async function runChatDropsReady(
  admin: SupabaseClient,
  pushUrl: string | null,
  bearer: string | null,
  nowMs: number = Date.now(),
): Promise<{ ready: number; pushed: number }> {
  const nowIso = new Date(nowMs).toISOString();
  const { data, error } = await admin
    .from('chat_drop_originals')
    .select('message_id, chat_id, reveal_at')
    .is('ready_notified_at', null)
    .lte('reveal_at', nowIso)
    .order('reveal_at', { ascending: true })
    .limit(SWEEP_LIMIT);
  if (error) throw new Error(`drops-ready fetch: ${error.message}`);
  const rows = (data ?? []) as Array<{ message_id: string; chat_id: string; reveal_at: string }>;
  if (rows.length === 0) return { ready: 0, pushed: 0 };

  const fresh: ReadyChatDrop[] = rows
    .map((r) => ({ messageId: r.message_id, chatId: r.chat_id, revealAtMs: Date.parse(r.reveal_at) }))
    .filter((d) => nowMs - d.revealAtMs <= DROP_READY_STALE_MS);

  let pushed = 0;
  if (fresh.length > 0 && pushUrl && bearer) {
    const participants = await chatParticipants(admin, [...new Set(fresh.map((d) => d.chatId))]);
    const recipients = [...new Set([...participants.values()].flat())];
    const byRecipient = groupReadyDropsByRecipient(fresh, participants, await activeMutes(admin, recipients, nowIso));
    for (const [userId, drops] of byRecipient) {
      if (!(await userAllowsPush(admin, userId, 'message_push_enabled'))) continue;
      const latest = drops[drops.length - 1];
      const ok = await sendPush(pushUrl, bearer, userId, dropReadyCopy(drops.length), {
        type: 'disposable_reveal',
        chat_id: latest.chatId,
        message_id: latest.messageId,
        drop_count: drops.length,
      });
      if (ok) pushed += 1;
    }
  }

  // Marked even when the push failed or was skipped: one attempt per drop, never a retry storm.
  const { error: markError } = await admin
    .from('chat_drop_originals')
    .update({ ready_notified_at: nowIso })
    .in('message_id', rows.map((r) => r.message_id));
  if (markError) throw new Error(`drops-ready mark: ${markError.message}`);

  return { ready: rows.length, pushed };
}
