import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { configNumber } from '@/lib/server/featureFlags';
import { loadViewerPeers } from '@/lib/server/connections/viewerPeers';
import { displayNameFromUser, type UserProfileRow } from '@/lib/events/attendeeDirectory';
import { DEFAULT_PRESENCE_CONFIG, summarizePresence, type PresenceConfig } from '@/lib/map/soundtrackPresence';

export function presenceConfigFrom(config: Record<string, unknown>): PresenceConfig {
  return {
    heartbeatTtlMinutes: configNumber(config, 'heartbeat_ttl_minutes', DEFAULT_PRESENCE_CONFIG.heartbeatTtlMinutes, { min: 2, max: 60 }),
  };
}

export type ListeningPayload = {
  count: number;
  is_listening: boolean;
  connections: Array<{ user_id: string; name: string; avatar_url: string | null }>;
  heartbeat_seconds: number;
};

/** The count, the viewer's own state, and names of their non-ghosted connections listening. */
export async function loadListening(
  admin: SupabaseClient,
  beaconId: string,
  viewerId: string,
  config: PresenceConfig,
  nowMs: number = Date.now(),
): Promise<ListeningPayload> {
  const cutoffIso = new Date(nowMs - config.heartbeatTtlMinutes * 60_000).toISOString();
  const { data, error } = await admin
    .from('beacon_presence')
    .select('user_id, last_seen_at')
    .eq('beacon_id', beaconId)
    .gt('last_seen_at', cutoffIso)
    .limit(1000);
  if (error) throw new Error(`beacon_presence read: ${error.message}`);
  const rows = ((data ?? []) as Array<{ user_id: string; last_seen_at: string }>).map((r) => ({
    userId: r.user_id,
    lastSeenAtMs: Date.parse(r.last_seen_at),
  }));

  const listenerIds = rows.map((r) => r.userId).filter((id) => id !== viewerId);
  let peers = new Set<string>();
  const profiles = new Map<string, UserProfileRow & { ghost_mode?: boolean | null }>();
  if (listenerIds.length > 0) {
    peers = new Set((await loadViewerPeers(admin, viewerId)).keys());
    const connected = listenerIds.filter((id) => peers.has(id));
    if (connected.length > 0) {
      const { data: users, error: usersError } = await admin
        .from('users')
        .select('id, name, image, first_name, last_name, ghost_mode')
        .in('id', connected);
      if (usersError) throw new Error(`users read: ${usersError.message}`);
      for (const u of (users ?? []) as Array<UserProfileRow & { ghost_mode?: boolean | null }>) profiles.set(u.id, u);
    }
  }
  const ghosted = new Set([...profiles.values()].filter((u) => u.ghost_mode === true).map((u) => u.id));
  const summary = summarizePresence({ rows, viewerId, connectedPeerIds: peers, ghostedUserIds: ghosted, nowMs, config });
  return {
    count: summary.count,
    is_listening: summary.isListening,
    connections: summary.namedUserIds.flatMap((id) => {
      const profile = profiles.get(id);
      return profile ? [{ user_id: id, name: displayNameFromUser(profile, 'Someone'), avatar_url: profile.image ?? null }] : [];
    }),
    heartbeat_seconds: Math.round((config.heartbeatTtlMinutes * 60) / 2),
  };
}
