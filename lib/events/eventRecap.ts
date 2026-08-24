import type { SupabaseClient } from "@supabase/supabase-js";
import {
  displayNameFromUser,
  enrichAttendeeDirectory,
  type UserProfileRow,
} from "@/lib/events/attendeeDirectory";
import { countEventRsvps } from "@/lib/events/publicEvent";
import { eventStartAtFromMetadata, isRecord } from "@/lib/events/eventMetadata";

export type RecapPerson = {
  user_id: string;
  name: string;
  avatar_url: string | null;
  connection_id: string;
};

export type RecapSummary = {
  beacon_id: string;
  connections_made: number;
  check_in_count: number;
  rsvp_count: number;
  density: number;
  repeat_reconnect_count: number;
  new_pair_count: number;
};

function otherUserId(userIds: string[], viewerId: string): string | null {
  return userIds.find((id) => id && id !== viewerId) ?? null;
}

async function loadProfiles(
  admin: SupabaseClient,
  userIds: string[],
): Promise<Map<string, UserProfileRow>> {
  const unique = [...new Set(userIds.filter(Boolean))];
  if (unique.length === 0) return new Map();
  const { data } = await admin
    .from("users")
    .select("id, name, image, first_name, last_name")
    .in("id", unique);
  const out = new Map<string, UserProfileRow>();
  if (!Array.isArray(data)) return out;
  for (const raw of data) {
    if (!isRecord(raw) || typeof raw.id !== "string") continue;
    out.set(raw.id, {
      id: raw.id,
      name: typeof raw.name === "string" ? raw.name : null,
      image: typeof raw.image === "string" ? raw.image : null,
      first_name: typeof raw.first_name === "string" ? raw.first_name : null,
      last_name: typeof raw.last_name === "string" ? raw.last_name : null,
    });
  }
  return out;
}

export async function loadAttendeeRecap(
  admin: SupabaseClient,
  beaconId: string,
  userId: string,
): Promise<RecapPerson[]> {
  const { data: encounters, error } = await admin
    .from("connection_encounters")
    .select("connection_id")
    .eq("event_beacon_id", beaconId);

  if (error || !Array.isArray(encounters)) return [];

  const connectionIds = [
    ...new Set(
      encounters
        .map((row) => (isRecord(row) && typeof row.connection_id === "string" ? row.connection_id : null))
        .filter((id): id is string => id != null),
    ),
  ];
  if (connectionIds.length === 0) return [];

  const { data: connections } = await admin
    .from("connections")
    .select("id, user_ids")
    .in("id", connectionIds);

  const seen = new Set<string>();
  const pairs: Array<{ connection_id: string; other_id: string }> = [];
  if (Array.isArray(connections)) {
    for (const row of connections) {
      if (!isRecord(row) || typeof row.id !== "string") continue;
      const userIds = Array.isArray(row.user_ids)
        ? row.user_ids.filter((id): id is string => typeof id === "string")
        : [];
      if (!userIds.includes(userId)) continue;
      const other = otherUserId(userIds, userId);
      if (other == null || seen.has(other)) continue;
      seen.add(other);
      pairs.push({ connection_id: row.id, other_id: other });
    }
  }

  const profiles = await loadProfiles(
    admin,
    pairs.map((p) => p.other_id),
  );
  return pairs.map((pair) => {
    const profile = profiles.get(pair.other_id) ?? null;
    return {
      user_id: pair.other_id,
      name: displayNameFromUser(profile),
      avatar_url: profile?.image ?? null,
      connection_id: pair.connection_id,
    };
  });
}

export async function loadRecapSummary(
  admin: SupabaseClient,
  beaconId: string,
): Promise<RecapSummary> {
  const [{ data: encounters }, { count: checkInCount }, rsvpCount, { data: beacon }] =
    await Promise.all([
      admin.from("connection_encounters").select("connection_id").eq("event_beacon_id", beaconId),
      admin
        .from("event_check_ins")
        .select("user_id", { count: "exact", head: true })
        .eq("beacon_id", beaconId),
      countEventRsvps(admin, beaconId),
      admin.from("map_beacons").select("metadata").eq("id", beaconId).maybeSingle(),
    ]);

  const connectionIds = [
    ...new Set(
      (Array.isArray(encounters) ? encounters : [])
        .map((row) => (isRecord(row) && typeof row.connection_id === "string" ? row.connection_id : null))
        .filter((id): id is string => id != null),
    ),
  ];

  const connectionsMade = connectionIds.length;
  const checkIns = checkInCount ?? 0;
  const density = connectionsMade / Math.max(checkIns, 1);

  let repeatReconnectCount = 0;
  const meta = isRecord(beacon) && isRecord(beacon.metadata) ? beacon.metadata : {};
  const startIso = eventStartAtFromMetadata(meta);
  const startMs = startIso ? Date.parse(startIso) : Number.NaN;

  if (connectionIds.length > 0 && Number.isFinite(startMs)) {
    const { data: connections } = await admin
      .from("connections")
      .select("id, created")
      .in("id", connectionIds);
    if (Array.isArray(connections)) {
      for (const row of connections) {
        if (!isRecord(row)) continue;
        const createdRaw = row.created;
        const createdMs =
          typeof createdRaw === "number"
            ? createdRaw > 1e12
              ? createdRaw
              : createdRaw * 1000
            : typeof createdRaw === "string"
              ? Date.parse(createdRaw)
              : Number.NaN;
        if (Number.isFinite(createdMs) && createdMs < startMs) repeatReconnectCount += 1;
      }
    }
  }

  return {
    beacon_id: beaconId,
    connections_made: connectionsMade,
    check_in_count: checkIns,
    rsvp_count: rsvpCount,
    density,
    repeat_reconnect_count: repeatReconnectCount,
    new_pair_count: Math.max(0, connectionsMade - repeatReconnectCount),
  };
}

export async function loadMutualConnectionAttendees(
  admin: SupabaseClient,
  beaconId: string,
  viewerId: string,
): Promise<{
  count: number;
  attendees: Array<{ user_id: string; name: string; avatar_url: string | null }>;
}> {
  const directory = await enrichAttendeeDirectory(admin, beaconId, viewerId);
  const connectionIds = directory.attendees
    .filter((a) => a.relationship === "connection")
    .map((a) => a.user_id);

  const ghostIds = new Set<string>();
  if (connectionIds.length > 0) {
    const { data: ghostRows } = await admin
      .from("users")
      .select("id, ghost_mode")
      .in("id", connectionIds)
      .eq("ghost_mode", true);
    if (Array.isArray(ghostRows)) {
      for (const row of ghostRows) {
        if (isRecord(row) && typeof row.id === "string") ghostIds.add(row.id);
      }
    }
  }

  const attendees = directory.attendees
    .filter((a) => a.relationship === "connection" && !ghostIds.has(a.user_id))
    .map((a) => ({ user_id: a.user_id, name: a.name, avatar_url: a.avatar_url }));

  return { count: attendees.length, attendees };
}

export async function userParticipatedInEvent(
  admin: SupabaseClient,
  beaconId: string,
  userId: string,
): Promise<boolean> {
  const [{ data: rsvp }, { data: checkIn }] = await Promise.all([
    admin
      .from("beacon_attendees")
      .select("user_id")
      .eq("beacon_id", beaconId)
      .eq("user_id", userId)
      .maybeSingle(),
    admin
      .from("event_check_ins")
      .select("user_id")
      .eq("beacon_id", beaconId)
      .eq("user_id", userId)
      .maybeSingle(),
  ]);
  return rsvp != null || checkIn != null;
}
