import type { SupabaseClient } from '@supabase/supabase-js';
import { sendPush, userAllowsPush } from '@/lib/nudges/moments';
import { resolveFeature } from '@/lib/server/featureFlags';
import { loadViewerPeers } from '@/lib/server/connections/viewerPeers';
import { resolveSharedDrops } from '@/lib/server/sharedDrops';
import { displayNameFromUser, type UserProfileRow } from '@/lib/events/attendeeDirectory';

/**
 * "{Name}'s drop just developed": one push per person when shared Click Drops from their
 * connections develop (story-style, an hour after posting). Runs every minute.
 *
 * Each drop is claimed (release_notified_at set where still null) before anything is sent, so
 * overlapping runs never push twice. Only drops that developed within `RELEASE_FRESH_MS` are
 * considered: a late push is noise, and older rows are never touched. The audience is resolved
 * exactly as the strip does (`resolveSharedDrops` per viewer), never from the poster's say-so.
 */
export const RELEASE_FRESH_MS = 30 * 60 * 1000;
const SWEEP_LIMIT = 200;

type ReleasedDrop = { id: string; user_id: string };

export function dropReleasedCopy(posterNames: string[]): { title: string; body: string } {
  const [first, ...rest] = posterNames;
  const name = first ?? 'A connection';
  if (rest.length === 0) return { title: 'Click Drops', body: `${name}'s drop just developed. Take a look.` };
  return {
    title: 'Click Drops',
    body: rest.length === 1 ? `New drops from ${name} and ${rest[0]} just developed.` : `New drops from ${name} and ${rest.length} others just developed.`,
  };
}

/** viewer → the released drops they may see, in release order (posters never notified of their own). */
export async function releasedDropsByViewer(
  admin: SupabaseClient,
  drops: ReleasedDrop[],
): Promise<Map<string, ReleasedDrop[]>> {
  const candidates = new Set<string>();
  for (const poster of new Set(drops.map((d) => d.user_id))) {
    for (const peer of (await loadViewerPeers(admin, poster)).keys()) candidates.add(peer);
  }
  const out = new Map<string, ReleasedDrop[]>();
  const ids = drops.map((d) => d.id);
  for (const viewer of candidates) {
    const visible = await resolveSharedDrops(admin, viewer, ids);
    const mine = drops.filter((d) => d.user_id !== viewer && visible.has(d.id));
    if (mine.length > 0) out.set(viewer, mine);
  }
  return out;
}

export async function runSharedDropsReleased(
  admin: SupabaseClient,
  pushUrl: string | null,
  bearer: string | null,
  nowMs: number = Date.now(),
): Promise<{ released: number; pushed: number }> {
  const nowIso = new Date(nowMs).toISOString();
  const { data: due, error } = await admin
    .from('shared_drops')
    .select('id')
    .is('release_notified_at', null)
    .is('deleted_at', null)
    .lte('reveal_at', nowIso)
    .gt('reveal_at', new Date(nowMs - RELEASE_FRESH_MS).toISOString())
    .order('reveal_at', { ascending: true })
    .limit(SWEEP_LIMIT);
  if (error) throw new Error(`drops-released fetch: ${error.message}`);
  const dueIds = ((due ?? []) as Array<{ id: string }>).map((r) => r.id);
  if (dueIds.length === 0) return { released: 0, pushed: 0 };

  // Claim first: only rows this run flipped are pushed.
  const { data: claimed, error: claimError } = await admin
    .from('shared_drops')
    .update({ release_notified_at: nowIso })
    .in('id', dueIds)
    .is('release_notified_at', null)
    .select('id, user_id');
  if (claimError) throw new Error(`drops-released claim: ${claimError.message}`);
  const drops = (claimed ?? []) as ReleasedDrop[];
  if (drops.length === 0 || !pushUrl || !bearer) return { released: drops.length, pushed: 0 };

  const byViewer = await releasedDropsByViewer(admin, drops);
  const posterIds = [...new Set(drops.map((d) => d.user_id))];
  const { data: posters } = await admin.from('users').select('id, name, image, first_name, last_name').in('id', posterIds);
  const names = new Map(
    ((posters ?? []) as UserProfileRow[]).map((u) => [u.id, displayNameFromUser(u, 'A connection').split(' ')[0] ?? 'A connection']),
  );

  let pushed = 0;
  for (const [viewer, visible] of byViewer) {
    if (!(await resolveFeature(admin, 'shared_drops', viewer)).enabled) continue;
    if (!(await userAllowsPush(admin, viewer, 'drop_release_push_enabled'))) continue;
    const posterNames = [...new Set(visible.map((d) => names.get(d.user_id) ?? 'A connection'))];
    const latest = visible[visible.length - 1];
    const ok = await sendPush(pushUrl, bearer, viewer, dropReleasedCopy(posterNames), {
      type: 'shared_drop_released',
      drop_id: latest.id,
      poster_id: latest.user_id,
      drop_count: visible.length,
    });
    if (ok) pushed += 1;
  }
  return { released: drops.length, pushed };
}
