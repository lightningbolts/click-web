import type { SupabaseClient } from "@supabase/supabase-js";
import type { MapBeaconRecord } from "@/lib/map/mapBeacons";

export type BeaconVisibilityAudience = "everyone" | "connections" | "core_connections";

export function parseBeaconVisibilityAudience(raw: unknown): BeaconVisibilityAudience {
  const v = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (v === "connections") return "connections";
  if (v === "core_connections" || v === "core") return "core_connections";
  return "everyone";
}

type ViewerBeaconAudience = {
  connectionPeerIds: Set<string>;
  corePeerIds: Set<string>;
};

async function loadViewerBeaconAudience(
  admin: SupabaseClient,
  viewerId: string,
): Promise<ViewerBeaconAudience> {
  const connectionPeerIds = new Set<string>();
  const connUserIdsById = new Map<string, string[]>();

  const { data: connections, error: connError } = await admin
    .from("connections")
    .select("id, user_ids")
    .contains("user_ids", [viewerId]);

  if (connError) {
    console.error("loadViewerBeaconAudience connections:", connError.message);
  } else if (Array.isArray(connections)) {
    for (const row of connections) {
      if (row == null || typeof row !== "object") continue;
      const id = typeof (row as { id?: unknown }).id === "string" ? (row as { id: string }).id : null;
      const userIds = (row as { user_ids?: unknown }).user_ids;
      if (id == null || !Array.isArray(userIds)) continue;
      const peers = userIds.filter((uid): uid is string => typeof uid === "string" && uid !== viewerId);
      connUserIdsById.set(id, userIds.filter((uid): uid is string => typeof uid === "string"));
      for (const peer of peers) {
        connectionPeerIds.add(peer);
      }
    }
  }

  const corePeerIds = new Set<string>();
  const { data: coreRows, error: coreError } = await admin
    .from("connection_core")
    .select("connection_id")
    .eq("user_id", viewerId);

  if (coreError) {
    console.error("loadViewerBeaconAudience connection_core:", coreError.message);
  } else if (Array.isArray(coreRows)) {
    for (const row of coreRows) {
      if (row == null || typeof row !== "object") continue;
      const connectionId =
        typeof (row as { connection_id?: unknown }).connection_id === "string"
          ? (row as { connection_id: string }).connection_id
          : null;
      if (connectionId == null) continue;
      const userIds = connUserIdsById.get(connectionId);
      if (userIds == null) continue;
      const peer = userIds.find((uid) => uid !== viewerId);
      if (peer != null) corePeerIds.add(peer);
    }
  }

  return { connectionPeerIds, corePeerIds };
}

/** Drops beacons the viewer is not allowed to see based on creator audience settings. */
export async function filterBeaconsForViewer(
  admin: SupabaseClient,
  viewerId: string,
  beacons: MapBeaconRecord[],
): Promise<MapBeaconRecord[]> {
  if (beacons.length === 0) return beacons;

  const audience = await loadViewerBeaconAudience(admin, viewerId);

  return beacons.filter((b) => {
    if (b.creator_id === viewerId) return true;
    const vis = parseBeaconVisibilityAudience(b.visibility_audience);
    if (vis === "everyone") return true;
    if (vis === "connections") return audience.connectionPeerIds.has(b.creator_id);
    if (vis === "core_connections") return audience.corePeerIds.has(b.creator_id);
    return true;
  });
}

export function parseVisibilityAudienceFromBody(body: Record<string, unknown>): BeaconVisibilityAudience {
  const raw =
    body.visibility_audience ??
    body.visibilityAudience ??
    body.audience ??
    body.visibility;
  return parseBeaconVisibilityAudience(raw);
}
