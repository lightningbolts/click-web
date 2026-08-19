import type { SupabaseClient } from '@supabase/supabase-js';
import {
  bfsComponent,
  buildUserAdjacency,
  latestHandshakeRowPerUser,
  type HandshakeRowLite,
} from '@/lib/server/proximity/matching';
import type { PendingHandshakeRow } from '@/types/supabase-json';
import { fetchScopedPendingCandidates, pendingRowToHandshakeLite } from '@/lib/server/proximity/bindSupport';

export type MatchGraph = {
  rows: PendingHandshakeRow[];
  nodeRows: HandshakeRowLite[];
  latestByUser: Map<string, HandshakeRowLite>;
  adj: Map<string, Set<string>>;
  matchedIds: Set<string>;
  error: string | null;
};

/**
 * Load the caller-scoped pending-handshake candidates and derive the connected
 * component of users reachable from the caller via token/GPS evidence.
 */
export async function loadMatchGraph(
  admin: SupabaseClient,
  opts: {
    nowIso: string;
    callerUserId: string;
    evidenceTokens: string[];
    lat: number | null;
    lon: number | null;
  },
): Promise<MatchGraph> {
  const { nowIso, callerUserId, evidenceTokens, lat, lon } = opts;
  const scoped = await fetchScopedPendingCandidates(admin, {
    nowIso,
    callerUserId,
    evidenceTokens,
    lat,
    lon,
  });
  if (scoped.error) {
    return {
      rows: [],
      nodeRows: [],
      latestByUser: new Map(),
      adj: new Map(),
      matchedIds: new Set(),
      error: scoped.error,
    };
  }
  const rows = scoped.rows;
  const handshakeLites = rows.map(pendingRowToHandshakeLite);
  const latestByUser = latestHandshakeRowPerUser(handshakeLites);
  const nodeRows = [...latestByUser.values()];
  const adj = buildUserAdjacency(nodeRows);
  const component = bfsComponent(callerUserId, adj);
  const matchedIds = new Set<string>([...component].filter((id) => id !== callerUserId));
  return { rows, nodeRows, latestByUser, adj, matchedIds, error: null };
}
