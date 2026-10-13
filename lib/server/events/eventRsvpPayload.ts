import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { displayNameFromUser, type UserProfileRow } from "@/lib/events/attendeeDirectory";
import { isRecord } from "@/lib/events/eventMetadata";
import { loadRequestStatus } from "@/lib/events/eventRsvpPolicy";
import { countEventRsvps } from "@/lib/events/publicEvent";

/** PostgREST may return an embedded FK row as an object or a one-element array. */
function joinedUserProfile(raw: unknown): UserProfileRow | null {
  if (raw == null) return null;
  if (Array.isArray(raw)) {
    return joinedUserProfile(raw[0] ?? null);
  }
  if (!isRecord(raw)) return null;
  const id = typeof raw.id === "string" ? raw.id : null;
  if (id == null) return null;
  return {
    id,
    name: typeof raw.name === "string" ? raw.name : null,
    image: typeof raw.image === "string" ? raw.image : null,
    first_name: typeof raw.first_name === "string" ? raw.first_name : null,
    last_name: typeof raw.last_name === "string" ? raw.last_name : null,
  };
}

function parseAttendeeRows(data: unknown): Array<{ user_id: string; signed_up_at: string }> {
  if (!Array.isArray(data)) return [];
  const rows: Array<{ user_id: string; signed_up_at: string }> = [];
  for (const item of data) {
    if (!isRecord(item)) continue;
    const userId = typeof item.user_id === "string" ? item.user_id : null;
    const signedUpAt =
      (typeof item.created_at === "string" ? item.created_at : null) ??
      (typeof item.rsvpd_at === "string" ? item.rsvpd_at : null);
    if (userId == null || signedUpAt == null) continue;
    rows.push({ user_id: userId, signed_up_at: signedUpAt });
  }
  return rows;
}

export async function loadAttendeeProfiles(
  admin: SupabaseClient,
  userIds: string[],
): Promise<Map<string, UserProfileRow>> {
  const unique = [...new Set(userIds.filter((id) => id.length > 0))];
  if (unique.length === 0) return new Map();

  const { data, error } = await admin
    .from("users")
    .select("id, name, image, first_name, last_name")
    .in("id", unique);

  if (error != null || !Array.isArray(data)) {
    console.error("loadAttendeeProfiles:", error?.message);
    return new Map();
  }

  const out = new Map<string, UserProfileRow>();
  for (const raw of data) {
    const profile = joinedUserProfile(raw);
    if (profile != null) out.set(profile.id, profile);
  }
  return out;
}

/**
 * Who's going and the viewer's own RSVP (`GET /api/beacons/{id}/rsvp`, `eventRsvpKey`), also read
 * by the event page so its people and going line render with it. Hosts-only guest lists show
 * other guests to those who may manage the event only.
 */
export async function loadEventRsvpPayload(
  admin: SupabaseClient,
  beaconId: string,
  userId: string,
  { mayManage, guestListVisibility }: { mayManage: boolean; guestListVisibility: string },
) {
  const { data, error } = await admin
    .from("beacon_attendees")
    .select("user_id, created_at, rsvpd_at")
    .eq("beacon_id", beaconId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`event attendees: ${error.message}`);

  const attendeeRows = parseAttendeeRows(data);
  const visibleRows =
    guestListVisibility === "hosts_only" && !mayManage ? attendeeRows.filter((row) => row.user_id === userId) : attendeeRows;
  const [profiles, requestStatus, rsvpCount] = await Promise.all([
    loadAttendeeProfiles(admin, visibleRows.map((row) => row.user_id)),
    loadRequestStatus(admin, beaconId, userId),
    countEventRsvps(admin, beaconId),
  ]);
  const attendees = visibleRows.map((row) => {
    const profile = profiles.get(row.user_id) ?? null;
    return {
      user_id: row.user_id,
      name: displayNameFromUser(profile),
      avatar_url: profile?.image ?? null,
      signed_up_at: row.signed_up_at,
    };
  });

  return {
    beacon_id: beaconId,
    attendees,
    current_user_signed_up: attendeeRows.some((row) => row.user_id === userId),
    request_status: requestStatus,
    rsvp_count: rsvpCount,
  };
}
