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

/** Place roles that may write (create, edit, run) the Place's events. Viewers are read-only (spec §9). */
export const PLACE_WRITE_ROLES = ["owner", "manager"] as const;
export type PlaceRole = "owner" | "manager" | "viewer";

export async function placeRoleFor(
  admin: SupabaseClient,
  userId: string,
  placeId: string,
): Promise<PlaceRole | null> {
  const { data } = await admin
    .from("place_managers")
    .select("role")
    .eq("place_id", placeId)
    .eq("user_id", userId)
    .maybeSingle();
  const role = isRecord(data) ? data.role : null;
  return role === "owner" || role === "manager" || role === "viewer" ? role : null;
}

export function placeRoleCanWrite(role: PlaceRole | null): boolean {
  return role === "owner" || role === "manager";
}

/** Creator, or an owner/manager of the hosting Place. Place viewers can't manage. */
export async function userMayManageBeacon(
  admin: SupabaseClient,
  userId: string,
  beacon: Pick<BeaconManageRow, "creator_id" | "venue_id">,
): Promise<boolean> {
  if (beacon.creator_id === userId) return true;
  if (!beacon.venue_id) return false;
  return placeRoleCanWrite(await placeRoleFor(admin, userId, beacon.venue_id));
}

export type EventAccess = "manage" | "view";

/**
 * What a user may do on an event's manage page (spec §7.6.4): the creator and Place
 * owners / managers manage; Place viewers see it read-only; everyone else gets nothing.
 */
export async function eventAccessFor(
  admin: SupabaseClient,
  userId: string,
  beacon: Pick<BeaconManageRow, "creator_id" | "venue_id">,
): Promise<EventAccess | null> {
  if (beacon.creator_id === userId) return "manage";
  if (!beacon.venue_id) return null;
  const role = await placeRoleFor(admin, userId, beacon.venue_id);
  return placeRoleCanWrite(role) ? "manage" : role === "viewer" ? "view" : null;
}
