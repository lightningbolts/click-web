import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { redactEventFieldsForViewer } from '@/lib/server/connections/redaction';
import {
  dedupeIds,
  executeActiveConnectionsQuery,
  executeArchivedConnectionsQuery,
  executeMapConnectionsQuery,
  fetchJunctionConnectionIds,
  sweepStaleConnectionsForUser,
} from '@/lib/server/connections/queries';

export type DashboardBundle = {
  active: Record<string, unknown>[];
  archived: Record<string, unknown>[];
  map: Record<string, unknown>[];
  core: string[];
};

/**
 * `GET /api/connections?bundle=dashboard` (one sweep + one junction fetch + parallel selects),
 * shared with the Clicks layout so the inbox can stream with the page.
 */
export async function loadDashboardBundle(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ ok: true; bundle: DashboardBundle } | { ok: false; error: string }> {
  const sweep = await sweepStaleConnectionsForUser(supabase, userId);
  if (!sweep.ok) {
    console.error('[connections bundle] sweep_stale_connections_for_user failed:', sweep.message);
    return { ok: false, error: sweep.message };
  }

  const [archivedForUser, hiddenForUser, coreForUser] = await Promise.all([
    fetchJunctionConnectionIds(supabase, 'connection_archives', userId),
    fetchJunctionConnectionIds(supabase, 'connection_hidden', userId),
    fetchJunctionConnectionIds(supabase, 'connection_core', userId),
  ]);

  const excludedIds = dedupeIds([...archivedForUser, ...hiddenForUser]);
  const hiddenSet = new Set(hiddenForUser);
  const includeArchivedIds = archivedForUser.filter((id) => !hiddenSet.has(id));

  const [activeResult, archivedResult, mapResult] = await Promise.all([
    executeActiveConnectionsQuery(supabase, userId, excludedIds),
    executeArchivedConnectionsQuery(supabase, userId, includeArchivedIds),
    executeMapConnectionsQuery(supabase, userId, hiddenForUser),
  ]);

  for (const [label, result] of [
    ['active', activeResult],
    ['archived', archivedResult],
    ['map', mapResult],
  ] as const) {
    if (result.error) {
      console.error(`Error fetching connections (bundle ${label}):`, result.error);
      return { ok: false, error: result.error.message };
    }
  }

  const [active, archived, map] = await Promise.all([
    redactEventFieldsForViewer(userId, (activeResult.data ?? []) as Record<string, unknown>[]),
    redactEventFieldsForViewer(userId, (archivedResult.data ?? []) as Record<string, unknown>[]),
    redactEventFieldsForViewer(userId, (mapResult.data ?? []) as Record<string, unknown>[]),
  ]);

  return { ok: true, bundle: { active, archived, map, core: coreForUser } };
}
