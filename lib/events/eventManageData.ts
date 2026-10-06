import type { SupabaseClient } from "@supabase/supabase-js";
import { displayNameFromUser } from "@/lib/events/attendeeDirectory";
import { isRecord } from "@/lib/events/eventMetadata";
import { loadUserProfiles } from "@/lib/events/eventRecap";

/** Organizer-side reads for the manage page (spec §7.6.4) and its read APIs. */

export type ManageRequest = {
  user_id: string;
  name: string;
  avatar_url: string | null;
  status: "pending" | "waitlisted";
  created_at: string;
};

export type ManageAttendee = {
  user_id: string;
  name: string;
  avatar_url: string | null;
  rsvpd_at: string | null;
  checked_in: boolean;
};

export type ManageGuestRsvp = {
  id: string;
  name: string;
  /** Null for Place viewers: they see who's coming, not how to reach them. */
  contact: string | null;
  created_at: string;
};

/** The table holds the most recent RSVPs; counts come from the full set. */
export const MANAGE_ATTENDEE_LIMIT = 500;

const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);

export async function loadRsvpRequests(admin: SupabaseClient, beaconId: string): Promise<ManageRequest[]> {
  const { data, error } = await admin
    .from("event_rsvp_requests")
    .select("user_id, status, created_at")
    .eq("beacon_id", beaconId)
    .in("status", ["pending", "waitlisted"])
    .order("created_at", { ascending: true });
  if (error) throw new Error(`rsvp requests: ${error.message}`);
  const rows = (Array.isArray(data) ? data : []).filter(
    (r): r is { user_id: string; status: "pending" | "waitlisted"; created_at: string } =>
      isRecord(r) && typeof r.user_id === "string" && (r.status === "pending" || r.status === "waitlisted"),
  );
  const profiles = await loadUserProfiles(admin, rows.map((r) => r.user_id));
  return rows.map((r) => {
    const p = profiles.get(r.user_id) ?? null;
    return {
      user_id: r.user_id,
      name: displayNameFromUser(p, "Click member"),
      avatar_url: p?.image ?? null,
      status: r.status,
      created_at: str(r.created_at) ?? "",
    };
  });
}

const ID_CHUNK = 100;

/** Which of these users checked in (ids chunked: the `in` list rides in the URL). */
async function checkedInAmong(admin: SupabaseClient, beaconId: string, userIds: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  const chunks: string[][] = [];
  for (let i = 0; i < userIds.length; i += ID_CHUNK) chunks.push(userIds.slice(i, i + ID_CHUNK));
  await Promise.all(
    chunks.map(async (ids) => {
      const { data, error } = await admin
        .from("event_check_ins")
        .select("user_id")
        .eq("beacon_id", beaconId)
        .in("user_id", ids);
      if (error) throw new Error(`check-ins: ${error.message}`);
      for (const r of data ?? []) if (isRecord(r) && typeof r.user_id === "string") out.add(r.user_id);
    }),
  );
  return out;
}

/** The most recent Click RSVPs with names and whether each checked in. */
export async function loadManageAttendees(admin: SupabaseClient, beaconId: string): Promise<ManageAttendee[]> {
  const { data, error } = await admin
    .from("beacon_attendees")
    .select("user_id, rsvpd_at, created_at")
    .eq("beacon_id", beaconId)
    .order("created_at", { ascending: false })
    .limit(MANAGE_ATTENDEE_LIMIT);
  if (error) throw new Error(`attendees: ${error.message}`);
  const rows = (data ?? []).filter(
    (r): r is { user_id: string; rsvpd_at: string | null; created_at: string | null } =>
      isRecord(r) && typeof r.user_id === "string",
  );
  const ids = rows.map((r) => r.user_id);
  const [profiles, checkedIn] = await Promise.all([loadUserProfiles(admin, ids), checkedInAmong(admin, beaconId, ids)]);
  return rows.map((r) => {
    const p = profiles.get(r.user_id) ?? null;
    return {
      user_id: r.user_id,
      name: displayNameFromUser(p, "Click member"),
      avatar_url: p?.image ?? null,
      rsvpd_at: str(r.rsvpd_at) ?? str(r.created_at),
      checked_in: checkedIn.has(r.user_id),
    };
  });
}

export type ManageCounts = {
  /** Click RSVPs plus guest (no account) RSVPs. */
  going: number;
  guests: number;
  requests: number;
  waitlist: number;
  checkedIn: number;
};

/** Exact head counts for the Overview tiles: no rows travel. */
export async function loadManageCounts(admin: SupabaseClient, beaconId: string): Promise<ManageCounts> {
  const head = { count: "exact" as const, head: true };
  const [members, guests, requests, waitlist, checkIns] = await Promise.all([
    admin.from("beacon_attendees").select("user_id", head).eq("beacon_id", beaconId),
    admin.from("event_guest_rsvps").select("id", head).eq("beacon_id", beaconId),
    admin.from("event_rsvp_requests").select("id", head).eq("beacon_id", beaconId).eq("status", "pending"),
    admin.from("event_rsvp_requests").select("id", head).eq("beacon_id", beaconId).eq("status", "waitlisted"),
    admin.from("event_check_ins").select("user_id", head).eq("beacon_id", beaconId),
  ]);
  const failed = [members, guests, requests, waitlist, checkIns].find((r) => r.error);
  if (failed?.error) throw new Error(`manage counts: ${failed.error.message}`);
  return {
    going: (members.count ?? 0) + (guests.count ?? 0),
    guests: guests.count ?? 0,
    requests: requests.count ?? 0,
    waitlist: waitlist.count ?? 0,
    checkedIn: checkIns.count ?? 0,
  };
}

export async function loadGuestRsvps(
  admin: SupabaseClient,
  beaconId: string,
  { showContact }: { showContact: boolean },
): Promise<ManageGuestRsvp[]> {
  const { data, error } = await admin
    .from("event_guest_rsvps")
    .select("id, name, contact, created_at")
    .eq("beacon_id", beaconId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`guest rsvps: ${error.message}`);
  return (Array.isArray(data) ? data : []).flatMap((r) => {
    if (!isRecord(r) || !str(r.id)) return [];
    return [
      {
        id: r.id as string,
        name: str(r.name) ?? "Guest",
        contact: showContact ? str(r.contact) : null,
        created_at: str(r.created_at) ?? "",
      },
    ];
  });
}
