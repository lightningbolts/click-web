import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadViewerPeers } from '@/lib/server/connections/viewerPeers';
import { displayNameFromUser, type UserProfileRow } from '@/lib/events/attendeeDirectory';

/** Reaction reads, kept free of target resolution so lists (shared drops) can import them. */
export type ReactionKind = 'soundtrack' | 'shared_drop';

export type ReactionsPayload = {
  mine: string | null;
  /** Owner: everyone. Others: their connections (never strangers). Newest first. */
  reactions: Array<{ user_id: string; name: string; avatar_url: string | null; emoji: string }>;
  is_owner: boolean;
};

/**
 * Reactions for several targets in one pass (one read each for reactions, peers and profiles),
 * so a list (the shared-drops strip) can ship them inline instead of one request per item.
 */
export async function loadReactionsBatch(
  admin: SupabaseClient,
  kind: ReactionKind,
  targets: Array<{ id: string; ownerId: string }>,
  viewerId: string,
): Promise<Map<string, ReactionsPayload>> {
  const out = new Map<string, ReactionsPayload>();
  if (targets.length === 0) return out;
  const { data, error } = await admin
    .from('reactions')
    .select('target_id, user_id, emoji')
    .eq('target_kind', kind)
    .in('target_id', targets.map((t) => t.id))
    .order('created_at', { ascending: false })
    .limit(Math.min(5000, 500 * targets.length));
  if (error) throw new Error(`reactions read: ${error.message}`);
  const rows = (data ?? []) as Array<{ target_id: string; user_id: string; emoji: string }>;
  const byTarget = new Map<string, typeof rows>();
  for (const r of rows) byTarget.set(r.target_id, [...(byTarget.get(r.target_id) ?? []), r]);

  // Non-owners see only their connections' reactions (never strangers).
  const needsPeers = targets.some((t) => t.ownerId !== viewerId && (byTarget.get(t.id) ?? []).some((r) => r.user_id !== viewerId));
  const peers = needsPeers ? new Set((await loadViewerPeers(admin, viewerId)).keys()) : null;
  const shownBy = new Map(
    targets.map((t) => [
      t.id,
      (byTarget.get(t.id) ?? []).filter((r) => r.user_id !== viewerId && (t.ownerId === viewerId || peers?.has(r.user_id))),
    ]),
  );
  const userIds = [...new Set([...shownBy.values()].flat().map((r) => r.user_id))];
  const { data: users } = userIds.length
    ? await admin.from('users').select('id, name, image, first_name, last_name').in('id', userIds)
    : { data: [] };
  const byId = new Map(((users ?? []) as UserProfileRow[]).map((u) => [u.id, u]));
  for (const t of targets) {
    out.set(t.id, {
      mine: (byTarget.get(t.id) ?? []).find((r) => r.user_id === viewerId)?.emoji ?? null,
      is_owner: t.ownerId === viewerId,
      reactions: (shownBy.get(t.id) ?? []).map((r) => ({
        user_id: r.user_id,
        name: displayNameFromUser(byId.get(r.user_id) ?? null, 'Someone'),
        avatar_url: byId.get(r.user_id)?.image ?? null,
        emoji: r.emoji,
      })),
    });
  }
  return out;
}
