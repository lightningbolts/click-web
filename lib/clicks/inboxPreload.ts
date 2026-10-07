import type { DashboardBundle } from '@/lib/server/connections/dashboardBundle';

/**
 * The Clicks inbox's first load, started by `clicks/layout.tsx` on the server and streamed with
 * the page, so the inbox doesn't wait on the browser to fetch it (spec §7.2).
 */
export type InboxPreload = {
  userId: string;
  loadedAt: number;
  bundle: DashboardBundle;
  names: Record<string, string>;
  images: Record<string, string | null>;
  selfIntents: Record<string, unknown>[];
  peerIntents: Record<string, unknown>[];
};

/**
 * A preload older than this is ignored and the inbox fetches fresh: a prefetched `/clicks` can
 * sit in the router cache for minutes, and messages that arrived meanwhile must still show.
 */
export const INBOX_PRELOAD_MAX_AGE_MS = 15_000;

/** The other people in the inbox's rows, for names and availability (same rule as the hook). */
export function inboxPeerIds(bundle: DashboardBundle, viewerId: string): string[] {
  const merged = new Map<string, Record<string, unknown>>();
  for (const row of [...bundle.active, ...bundle.archived]) {
    if (typeof row.id === 'string' && !merged.has(row.id)) merged.set(row.id, row);
  }
  if (merged.size === 0) return [];
  const rows = [...merged.values(), ...bundle.map.filter((r) => typeof r.id === 'string' && !merged.has(r.id))];
  const ids = new Set<string>();
  for (const row of rows) {
    if (!Array.isArray(row.user_ids)) continue;
    for (const id of row.user_ids) if (typeof id === 'string' && id !== viewerId) ids.add(id);
  }
  return [...ids];
}
