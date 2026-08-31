import type { SupabaseClient } from "@supabase/supabase-js";

export type BeaconManageRow = {
  id: string;
  creator_id: string;
  venue_id: string | null;
  beacon_type: string;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

export async function loadBeaconManageRow(
  admin: SupabaseClient,
  beaconId: string,
): Promise<BeaconManageRow | null> {
  const { data, error } = await admin
    .from("map_beacons")
    .select("id, creator_id, venue_id, beacon_type")
    .eq("id", beaconId)
    .maybeSingle();
  if (error || !isRecord(data)) return null;
  const id = typeof data.id === "string" ? data.id : null;
  const creatorId = typeof data.creator_id === "string" ? data.creator_id : null;
  if (id == null || creatorId == null) return null;
  return {
    id,
    creator_id: creatorId,
    venue_id: typeof data.venue_id === "string" ? data.venue_id : null,
    beacon_type: typeof data.beacon_type === "string" ? data.beacon_type : "",
  };
}

export async function userMayManageBeacon(
  admin: SupabaseClient,
  userId: string,
  beacon: Pick<BeaconManageRow, "creator_id" | "venue_id">,
): Promise<boolean> {
  if (beacon.creator_id === userId) return true;
  if (!beacon.venue_id) return false;
  const { data } = await admin
    .from("venue_managers")
    .select("id")
    .eq("venue_id", beacon.venue_id)
    .eq("user_id", userId)
    .maybeSingle();
  return data != null;
}
