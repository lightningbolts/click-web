import type { SupabaseClient } from "@supabase/supabase-js";
import { getSharedInterestTags } from "@/lib/userProfile/sharedInterests";

export type AttendeeRelationship = "self" | "connection" | "mutual" | "stranger";

export type DirectoryAttendee = {
  user_id: string;
  name: string;
  avatar_url: string | null;
  signed_up_at: string;
  distance_meters: number | null;
  shared_interests: string[];
  shared_interest_count: number;
  relationship: AttendeeRelationship;
  mutual_via: Array<{ user_id: string; name: string }>;
  mutual_connection_count: number;
};

export type DirectoryResponse = {
  beacon_id: string;
  attendees: DirectoryAttendee[];
  current_user_signed_up: boolean;
  current_user_checked_in: boolean;
  mutuals_section_unlocked: boolean;
};

export type UserProfileRow = {
  id: string;
  name: string | null;
  image: string | null;
  first_name: string | null;
  last_name: string | null;
};

export type AttendeeRow = {
  user_id: string;
  signed_up_at: string;
  distance_meters: number | null;
};

export type ConnectionRow = {
  id: string;
  user_ids: string[];
  status: string | null;
  expiry_state: string | null;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/** Reuse RSVP route display-name priority: first+last, then name, then fallback. */
export function displayNameFromUser(
  user: UserProfileRow | null,
  fallback = "Attendee",
): string {
  if (user == null) return fallback;
  const first = user.first_name?.trim() ?? "";
  const last = user.last_name?.trim() ?? "";
  const combined = [first, last].filter((s) => s.length > 0).join(" ").trim();
  if (combined.length > 0) return combined;
  const name = user.name?.trim();
  if (name != null && name.length > 0) return name;
  return fallback;
}

/**
 * Active-ish for directory FoF: status in active/kept, or expiry_state is not removed
 * (covers pending/legacy rows where status is null).
 */
export function isActiveIshConnection(row: {
  status?: string | null;
  expiry_state?: string | null;
}): boolean {
  const status = typeof row.status === "string" ? row.status : null;
  const expiry = typeof row.expiry_state === "string" ? row.expiry_state : null;

  // Spec: status in active/kept OR expiry_state not removed
  if (status === "active" || status === "kept") return true;
  if (status === "removed" || status === "archived") return false;
  if (expiry === "removed") return false;
  if (expiry != null && expiry !== "removed") return true;
  if (status == null && expiry == null) return true;
  if (status === "pending") return true;
  return false;
}

export function classifyRelationship(
  attendeeId: string,
  viewerId: string,
  directConnectionIds: ReadonlySet<string>,
  mutualVia: ReadonlyArray<{ user_id: string; name: string }>,
): AttendeeRelationship {
  if (attendeeId === viewerId) return "self";
  if (directConnectionIds.has(attendeeId)) return "connection";
  if (mutualVia.length > 0) return "mutual";
  return "stranger";
}

export function sortAlphabetically(attendees: DirectoryAttendee[]): DirectoryAttendee[] {
  return [...attendees].sort((a, b) => {
    const byName = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    if (byName !== 0) return byName;
    return a.user_id.localeCompare(b.user_id);
  });
}

export function sortByInterestOverlap(attendees: DirectoryAttendee[]): DirectoryAttendee[] {
  return [...attendees].sort((a, b) => {
    if (b.shared_interest_count !== a.shared_interest_count) {
      return b.shared_interest_count - a.shared_interest_count;
    }
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
}

/** Nearer RSVP distance first; null distances sort last. */
export function sortByRsvpDistance(attendees: DirectoryAttendee[]): DirectoryAttendee[] {
  return [...attendees].sort((a, b) => {
    const aDist = a.distance_meters;
    const bDist = b.distance_meters;
    if (aDist == null && bDist == null) {
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    }
    if (aDist == null) return 1;
    if (bDist == null) return -1;
    if (aDist !== bDist) return aDist - bDist;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
}

export function sortByMutualConnections(attendees: DirectoryAttendee[]): DirectoryAttendee[] {
  return [...attendees].sort((a, b) => {
    if (b.mutual_connection_count !== a.mutual_connection_count) {
      return b.mutual_connection_count - a.mutual_connection_count;
    }
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
}

export function parseAttendeeDirectoryRows(data: unknown): AttendeeRow[] {
  if (!Array.isArray(data)) return [];
  const rows: AttendeeRow[] = [];
  for (const item of data) {
    if (!isRecord(item)) continue;
    const userId = typeof item.user_id === "string" ? item.user_id : null;
    const signedUpAt =
      (typeof item.created_at === "string" ? item.created_at : null) ??
      (typeof item.rsvpd_at === "string" ? item.rsvpd_at : null);
    if (userId == null || signedUpAt == null) continue;
    const distanceRaw = item.distance_meters;
    const distance_meters =
      typeof distanceRaw === "number" && Number.isFinite(distanceRaw) ? distanceRaw : null;
    rows.push({ user_id: userId, signed_up_at: signedUpAt, distance_meters });
  }
  return rows;
}

export function parseConnectionRows(data: unknown): ConnectionRow[] {
  if (!Array.isArray(data)) return [];
  const rows: ConnectionRow[] = [];
  for (const item of data) {
    if (!isRecord(item)) continue;
    const id = typeof item.id === "string" ? item.id : null;
    if (id == null) continue;
    const rawIds = item.user_ids;
    const user_ids = Array.isArray(rawIds)
      ? rawIds.filter((x): x is string => typeof x === "string" && x.length > 0)
      : [];
    rows.push({
      id,
      user_ids,
      status: typeof item.status === "string" ? item.status : null,
      expiry_state: typeof item.expiry_state === "string" ? item.expiry_state : null,
    });
  }
  return rows;
}

export function peerIdsFromConnections(
  connections: ConnectionRow[],
  viewerId: string,
): Set<string> {
  const peers = new Set<string>();
  for (const conn of connections) {
    if (!isActiveIshConnection(conn)) continue;
    for (const id of conn.user_ids) {
      if (id !== viewerId) peers.add(id);
    }
  }
  return peers;
}

/**
 * Build FoF mutual_via map: for each non-direct peer A, which members of C connect to A.
 */
export function buildMutualViaMap(
  viewerId: string,
  directPeers: ReadonlySet<string>,
  fofConnections: ConnectionRow[],
  nameById: ReadonlyMap<string, string>,
): Map<string, Array<{ user_id: string; name: string }>> {
  const viaByAttendee = new Map<string, Map<string, string>>();

  for (const conn of fofConnections) {
    if (!isActiveIshConnection(conn)) continue;
    const members = conn.user_ids.filter((id) => id.length > 0);
    const viasInC = members.filter((id) => directPeers.has(id) && id !== viewerId);
    if (viasInC.length === 0) continue;

    const targets = members.filter(
      (id) => id !== viewerId && !directPeers.has(id),
    );
    for (const target of targets) {
      let viaMap = viaByAttendee.get(target);
      if (viaMap == null) {
        viaMap = new Map();
        viaByAttendee.set(target, viaMap);
      }
      for (const viaId of viasInC) {
        if (!viaMap.has(viaId)) {
          viaMap.set(viaId, nameById.get(viaId) ?? "Connection");
        }
      }
    }
  }

  const out = new Map<string, Array<{ user_id: string; name: string }>>();
  for (const [attendeeId, viaMap] of viaByAttendee) {
    out.set(
      attendeeId,
      [...viaMap.entries()].map(([user_id, name]) => ({ user_id, name })),
    );
  }
  return out;
}

export function buildDirectoryAttendees(args: {
  viewerId: string;
  attendeeRows: AttendeeRow[];
  profiles: Map<string, UserProfileRow>;
  interestsByUser: Map<string, string[]>;
  directPeers: ReadonlySet<string>;
  mutualViaByAttendee: Map<string, Array<{ user_id: string; name: string }>>;
}): DirectoryAttendee[] {
  const viewerTags = args.interestsByUser.get(args.viewerId) ?? [];

  return args.attendeeRows.map((row) => {
    const profile = args.profiles.get(row.user_id) ?? null;
    const name = displayNameFromUser(profile);
    const peerTags = args.interestsByUser.get(row.user_id) ?? [];
    const shared_interests =
      row.user_id === args.viewerId
        ? []
        : getSharedInterestTags(viewerTags, peerTags);
    const mutual_via =
      row.user_id === args.viewerId || args.directPeers.has(row.user_id)
        ? []
        : (args.mutualViaByAttendee.get(row.user_id) ?? []);
    const relationship = classifyRelationship(
      row.user_id,
      args.viewerId,
      args.directPeers,
      mutual_via,
    );

    return {
      user_id: row.user_id,
      name,
      avatar_url: profile?.image ?? null,
      signed_up_at: row.signed_up_at,
      distance_meters: row.distance_meters,
      shared_interests,
      shared_interest_count: shared_interests.length,
      relationship,
      mutual_via,
      mutual_connection_count: mutual_via.length,
    };
  });
}

function parseUserProfile(raw: unknown): UserProfileRow | null {
  if (raw == null) return null;
  if (Array.isArray(raw)) return parseUserProfile(raw[0] ?? null);
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

function parseInterestTags(raw: unknown): string[] {
  if (!isRecord(raw)) return [];
  const tags = raw.tags;
  if (!Array.isArray(tags)) return [];
  return tags.filter((t): t is string => typeof t === "string" && t.trim().length > 0);
}

async function loadProfiles(
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
    console.error("attendeeDirectory loadProfiles:", error?.message);
    return new Map();
  }

  const out = new Map<string, UserProfileRow>();
  for (const raw of data) {
    const profile = parseUserProfile(raw);
    if (profile != null) out.set(profile.id, profile);
  }
  return out;
}

async function loadInterestTagsByUser(
  admin: SupabaseClient,
  userIds: string[],
): Promise<Map<string, string[]>> {
  const unique = [...new Set(userIds.filter((id) => id.length > 0))];
  if (unique.length === 0) return new Map();

  const { data, error } = await admin
    .from("user_interests")
    .select("user_id, tags")
    .in("user_id", unique);

  if (error != null || !Array.isArray(data)) {
    console.error("attendeeDirectory loadInterestTags:", error?.message);
    return new Map();
  }

  const out = new Map<string, string[]>();
  for (const raw of data) {
    if (!isRecord(raw) || typeof raw.user_id !== "string") continue;
    out.set(raw.user_id, parseInterestTags(raw));
  }
  return out;
}

/**
 * Enrich RSVP attendees with interests, distances, and relationship labels.
 * Caller must enforce privacy (RSVP or check-in) before returning to clients.
 */
export async function enrichAttendeeDirectory(
  admin: SupabaseClient,
  beaconId: string,
  viewerId: string,
): Promise<{
  attendees: DirectoryAttendee[];
  current_user_signed_up: boolean;
  current_user_checked_in: boolean;
  mutuals_section_unlocked: boolean;
  has_rsvp: boolean;
  has_check_in: boolean;
}> {
  const { data: attendeeData, error: attendeeErr } = await admin
    .from("beacon_attendees")
    .select("user_id, created_at, rsvpd_at, distance_meters")
    .eq("beacon_id", beaconId)
    .order("created_at", { ascending: true });

  if (attendeeErr) {
    console.error("enrichAttendeeDirectory attendees:", attendeeErr.message);
    throw new Error("Failed to load attendees");
  }

  const attendeeRows = parseAttendeeDirectoryRows(attendeeData);
  const has_rsvp = attendeeRows.some((row) => row.user_id === viewerId);

  const { data: checkInRow, error: checkInErr } = await admin
    .from("event_check_ins")
    .select("user_id, checked_out_at")
    .eq("beacon_id", beaconId)
    .eq("user_id", viewerId)
    .maybeSingle();

  if (checkInErr) {
    console.error("enrichAttendeeDirectory check-in:", checkInErr.message);
  }

  const has_check_in = checkInRow != null;
  const current_user_checked_in =
    isRecord(checkInRow) &&
    (checkInRow.checked_out_at == null || checkInRow.checked_out_at === undefined);
  const mutuals_section_unlocked = current_user_checked_in;

  const { data: viewerConnsData, error: viewerConnsErr } = await admin
    .from("connections")
    .select("id, user_ids, status, expiry_state")
    .contains("user_ids", [viewerId]);

  if (viewerConnsErr) {
    console.error("enrichAttendeeDirectory connections:", viewerConnsErr.message);
  }

  const viewerConnections = parseConnectionRows(viewerConnsData);
  const directPeers = peerIdsFromConnections(viewerConnections, viewerId);

  let fofConnections: ConnectionRow[] = [];
  if (directPeers.size > 0) {
    const peerList = [...directPeers];
    const { data: fofData, error: fofErr } = await admin
      .from("connections")
      .select("id, user_ids, status, expiry_state")
      .overlaps("user_ids", peerList);

    if (fofErr) {
      console.error("enrichAttendeeDirectory FoF connections:", fofErr.message);
    } else {
      fofConnections = parseConnectionRows(fofData);
    }
  }

  const attendeeIds = attendeeRows.map((r) => r.user_id);
  const profileIds = [
    ...new Set([...attendeeIds, viewerId, ...directPeers]),
  ];
  const [profiles, interestsByUser] = await Promise.all([
    loadProfiles(admin, profileIds),
    loadInterestTagsByUser(admin, [...new Set([...attendeeIds, viewerId])]),
  ]);

  const nameById = new Map<string, string>();
  for (const [id, profile] of profiles) {
    nameById.set(id, displayNameFromUser(profile));
  }
  for (const peerId of directPeers) {
    if (!nameById.has(peerId)) nameById.set(peerId, "Connection");
  }

  const mutualViaByAttendee = buildMutualViaMap(
    viewerId,
    directPeers,
    fofConnections,
    nameById,
  );

  const attendees = buildDirectoryAttendees({
    viewerId,
    attendeeRows,
    profiles,
    interestsByUser,
    directPeers,
    mutualViaByAttendee,
  });

  return {
    attendees,
    current_user_signed_up: has_rsvp,
    current_user_checked_in,
    mutuals_section_unlocked,
    has_rsvp,
    has_check_in,
  };
}
