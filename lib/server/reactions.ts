import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveFeature } from '@/lib/server/featureFlags';
import { loadVisibleBeacon } from '@/lib/map/beaconVisibility';
import { resolveSharedDrops } from '@/lib/server/sharedDrops';
import { loadViewerPeers } from '@/lib/server/connections/viewerPeers';
import { displayNameFromUser, type UserProfileRow } from '@/lib/events/attendeeDirectory';

/** The small, fixed palette (tap once to react; tap again to take it back). */
export const REACTION_EMOJI = ['❤️', '🔥', '😂', '😍', '👏', '😮'] as const;
export type ReactionKind = 'soundtrack' | 'shared_drop';

/**
 * The target, if this viewer may see its reactions: a live soundtrack they can see, or a shared
 * drop in their audience (the poster always; others once it has developed). Null otherwise.
 * Each kind stays behind its own feature flag.
 */
export async function resolveReactionTarget(
  admin: SupabaseClient,
  kind: ReactionKind,
  id: string,
  viewerId: string,
): Promise<{ ownerId: string } | null> {
  if (kind === 'soundtrack') {
    if (!(await resolveFeature(admin, 'soundtrack_presence', viewerId)).enabled) return null;
    const loaded = await loadVisibleBeacon(admin, id, viewerId);
    const b = loaded?.beacon;
    return b && b.beacon_type === 'soundtrack' && Date.parse(b.expires_at) > Date.now() ? { ownerId: b.creator_id } : null;
  }
  if (!(await resolveFeature(admin, 'shared_drops', viewerId)).enabled) return null;
  const drop = (await resolveSharedDrops(admin, viewerId, [id])).get(id);
  if (!drop) return null;
  const { data } = await admin.from('shared_drops').select('user_id').eq('id', id).maybeSingle();
  const ownerId = (data as { user_id?: string } | null)?.user_id;
  if (!ownerId) return null;
  // Reacting to a photo you can't see yet makes no sense: others wait for it to develop.
  return ownerId === viewerId || drop.revealAtMs <= Date.now() ? { ownerId } : null;
}

export type ReactionsPayload = {
  mine: string | null;
  /** Owner: everyone. Others: their connections (never strangers). Newest first. */
  reactions: Array<{ user_id: string; name: string; avatar_url: string | null; emoji: string }>;
  is_owner: boolean;
};

export async function loadReactions(
  admin: SupabaseClient,
  kind: ReactionKind,
  id: string,
  viewerId: string,
  ownerId: string,
): Promise<ReactionsPayload> {
  const { data, error } = await admin
    .from('reactions')
    .select('user_id, emoji')
    .eq('target_kind', kind)
    .eq('target_id', id)
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) throw new Error(`reactions read: ${error.message}`);
  const rows = (data ?? []) as Array<{ user_id: string; emoji: string }>;
  const isOwner = ownerId === viewerId;
  const others = rows.filter((r) => r.user_id !== viewerId);
  const peers = isOwner || others.length === 0 ? null : new Set((await loadViewerPeers(admin, viewerId)).keys());
  const shown = others.filter((r) => isOwner || peers?.has(r.user_id));
  const { data: users } = shown.length
    ? await admin.from('users').select('id, name, image, first_name, last_name').in('id', shown.map((r) => r.user_id))
    : { data: [] };
  const byId = new Map(((users ?? []) as UserProfileRow[]).map((u) => [u.id, u]));
  return {
    mine: rows.find((r) => r.user_id === viewerId)?.emoji ?? null,
    is_owner: isOwner,
    reactions: shown.map((r) => ({
      user_id: r.user_id,
      name: displayNameFromUser(byId.get(r.user_id) ?? null, 'Someone'),
      avatar_url: byId.get(r.user_id)?.image ?? null,
      emoji: r.emoji,
    })),
  };
}
