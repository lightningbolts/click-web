/**
 * F5 — "Listening now" on soundtrack beacons. Pure summary of heartbeat rows: a count of everyone
 * listening, and names only for the viewer's connections who aren't ghosted.
 */

/** Anyone can listen from anywhere on the map (no location gate); a heartbeat just lapses. */
export type PresenceConfig = { heartbeatTtlMinutes: number };

export const DEFAULT_PRESENCE_CONFIG: PresenceConfig = { heartbeatTtlMinutes: 12 };

export type PresenceRow = { userId: string; lastSeenAtMs: number };

export type PresenceSummary = {
  /** Everyone listening right now, ghosted people and the viewer included. */
  count: number;
  /** Connections to name, most recent first (never ghosted, never strangers). */
  namedUserIds: string[];
  isListening: boolean;
};

export function summarizePresence(input: {
  rows: PresenceRow[];
  viewerId: string;
  connectedPeerIds: ReadonlySet<string>;
  ghostedUserIds: ReadonlySet<string>;
  nowMs: number;
  config: PresenceConfig;
}): PresenceSummary {
  const cutoff = input.nowMs - input.config.heartbeatTtlMinutes * 60_000;
  const live = input.rows.filter((r) => r.lastSeenAtMs > cutoff).sort((a, b) => b.lastSeenAtMs - a.lastSeenAtMs);
  return {
    count: live.length,
    namedUserIds: live
      .map((r) => r.userId)
      .filter((id) => id !== input.viewerId && input.connectedPeerIds.has(id) && !input.ghostedUserIds.has(id)),
    isListening: live.some((r) => r.userId === input.viewerId),
  };
}
