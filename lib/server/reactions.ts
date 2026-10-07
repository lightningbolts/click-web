import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveFeature } from '@/lib/server/featureFlags';
import { loadVisibleBeacon } from '@/lib/map/beaconVisibility';
import { resolveSharedDrops } from '@/lib/server/sharedDrops';
import { loadReactionsBatch, type ReactionKind, type ReactionsPayload } from '@/lib/server/reactionLists';

export { REACTION_EMOJI } from '@/lib/drops/reactionPalette';

const graphemes = new Intl.Segmenter('en', { granularity: 'grapheme' });

/**
 * Exactly one emoji (one grapheme that is pictographic or a flag, skin tones and ZWJ sequences
 * included) that fits the column's 16 code points. Never text, never two emoji.
 */
export function isReactionEmoji(value: string): boolean {
  if (!value || [...value].length > 16) return false;
  const parts = [...graphemes.segment(value)];
  return parts.length === 1 && /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(value) && !/[\p{L}\p{N}\s]/u.test(value);
}
export { loadReactionsBatch, type ReactionKind, type ReactionsPayload };

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

export async function loadReactions(
  admin: SupabaseClient,
  kind: ReactionKind,
  id: string,
  viewerId: string,
  ownerId: string,
): Promise<ReactionsPayload> {
  return (await loadReactionsBatch(admin, kind, [{ id, ownerId }], viewerId)).get(id)!;
}
