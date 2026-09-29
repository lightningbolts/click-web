import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isActiveChatListStatus, normalizeConnectionStatus } from '@/lib/dashboard/connectionStatus';

/**
 * The people a viewer is actively connected to, as the viewer sees them: connections that are
 * active/pending/kept, minus the ones the viewer archived or hid, minus anyone blocked in either
 * direction. Every "people you've met" surface (presence names, shared drops, reconnection
 * nudges, who's going) resolves its audience through this, never on the client.
 */
export type ViewerPeer = { userId: string; connectionId: string; isCore: boolean };

async function ids(
  query: PromiseLike<{ data: unknown; error: { message: string } | null }>,
  column: string,
  label: string,
): Promise<Set<string>> {
  const { data, error } = await query;
  if (error) throw new Error(`viewerPeers ${label}: ${error.message}`);
  return new Set(
    ((data ?? []) as Array<Record<string, unknown>>)
      .map((row) => row[column])
      .filter((v): v is string => typeof v === 'string' && v.length > 0),
  );
}

export async function loadViewerPeers(admin: SupabaseClient, viewerId: string): Promise<Map<string, ViewerPeer>> {
  const [connections, archived, hidden, core, blockedByViewer, blockedViewer] = await Promise.all([
    admin.from('connections').select('id, user_ids, status, expiry_state').contains('user_ids', [viewerId]),
    ids(admin.from('connection_archives').select('connection_id').eq('user_id', viewerId), 'connection_id', 'archives'),
    ids(admin.from('connection_hidden').select('connection_id').eq('user_id', viewerId), 'connection_id', 'hidden'),
    ids(admin.from('connection_core').select('connection_id').eq('user_id', viewerId), 'connection_id', 'core'),
    ids(admin.from('user_blocks').select('blocked_id').eq('blocker_id', viewerId), 'blocked_id', 'blocks'),
    ids(admin.from('user_blocks').select('blocker_id').eq('blocked_id', viewerId), 'blocker_id', 'blocked-by'),
  ]);
  if (connections.error) throw new Error(`viewerPeers connections: ${connections.error.message}`);

  const peers = new Map<string, ViewerPeer>();
  for (const row of (connections.data ?? []) as Array<Record<string, unknown>>) {
    const connectionId = typeof row.id === 'string' ? row.id : null;
    if (!connectionId || archived.has(connectionId) || hidden.has(connectionId)) continue;
    if (!isActiveChatListStatus(normalizeConnectionStatus(row))) continue;
    const userIds = Array.isArray(row.user_ids) ? (row.user_ids as unknown[]) : [];
    for (const raw of userIds) {
      const userId = typeof raw === 'string' ? raw.trim() : '';
      if (!userId || userId === viewerId || blockedByViewer.has(userId) || blockedViewer.has(userId)) continue;
      const isCore = core.has(connectionId);
      const existing = peers.get(userId);
      // Several connections to one person (reconnects, groups): keep one, core if any is core.
      if (!existing || (isCore && !existing.isCore)) peers.set(userId, { userId, connectionId, isCore });
    }
  }
  return peers;
}
