import type { SupabaseClient } from "@supabase/supabase-js";
import { parseLatLngFromLocationField } from "@/lib/map/mapBeaconApiShared";
import {
  eventDescriptionFromMetadata,
  eventEndAtFromMetadata,
  eventImageFromMetadata,
  eventLocationNameFromMetadata,
  eventStartAtFromMetadata,
  eventTimezoneFromMetadata,
  eventTitleFromMetadata,
  isRecord,
  isUpcomingEvent,
  metaString,
  parseBeaconMetadata,
  rsvpEnabledFromMetadata,
} from "@/lib/events/eventMetadata";

export type PublicEventPayload = {
  beacon_id: string;
  title: string | null;
  description: string | null;
  image_url: string | null;
  host_name: string | null;
  event_start_at: string | null;
  event_end_at: string | null;
  latitude: number | null;
  longitude: number | null;
  location_name: string | null;
  rsvp_count: number;
  rsvp_enabled: boolean;
  expires_at: string | null;
  created_at: string | null;
  timezone: string | null;
};

export async function countEventRsvps(
  admin: SupabaseClient,
  beaconId: string,
): Promise<number> {
  const counts = await countEventRsvpsByBeaconIds(admin, [beaconId]);
  return counts.get(beaconId) ?? 0;
}

export async function countEventRsvpsByBeaconIds(
  admin: SupabaseClient,
  beaconIds: string[],
): Promise<Map<string, number>> {
  const unique = [...new Set(beaconIds.filter(Boolean))];
  const counts = new Map<string, number>();
  for (const id of unique) counts.set(id, 0);
  if (unique.length === 0) return counts;

  const [{ data: clickRows }, { data: guestRows }] = await Promise.all([
    admin.from("beacon_attendees").select("beacon_id").in("beacon_id", unique),
    admin.from("event_guest_rsvps").select("beacon_id").in("beacon_id", unique),
  ]);

  const bump = (rows: unknown) => {
    if (!Array.isArray(rows)) return;
    for (const row of rows) {
      if (!isRecord(row) || typeof row.beacon_id !== "string") continue;
      counts.set(row.beacon_id, (counts.get(row.beacon_id) ?? 0) + 1);
    }
  };
  bump(clickRows);
  bump(guestRows);
  return counts;
}

function hostNameFromProfile(profile: Record<string, unknown>): string | null {
  const first = typeof profile.first_name === "string" ? profile.first_name.trim() : "";
  const last = typeof profile.last_name === "string" ? profile.last_name.trim() : "";
  const combined = [first, last].filter(Boolean).join(" ").trim();
  return combined || metaString(profile, "name");
}

async function loadHostNamesByCreatorIds(
  admin: SupabaseClient,
  creatorIds: string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(creatorIds.filter(Boolean))];
  const names = new Map<string, string>();
  if (unique.length === 0) return names;
  const { data } = await admin
    .from("users")
    .select("id, name, first_name, last_name")
    .in("id", unique);
  if (!Array.isArray(data)) return names;
  for (const row of data) {
    if (!isRecord(row) || typeof row.id !== "string") continue;
    const name = hostNameFromProfile(row);
    if (name) names.set(row.id, name);
  }
  return names;
}

export async function loadPublicEventPayload(
  admin: SupabaseClient,
  beaconId: string,
): Promise<PublicEventPayload | null> {
  const { data, error } = await admin
    .from("map_beacons")
    .select(
      "id, beacon_type, metadata, location, show_creator_name, creator_id, expires_at, visibility_audience, created_at",
    )
    .eq("id", beaconId)
    .maybeSingle();

  if (error || !isRecord(data) || data.beacon_type !== "event") {
    return null;
  }

  const meta = parseBeaconMetadata(data.metadata);
  const coords = parseLatLngFromLocationField(data.location, Number.NaN, Number.NaN);

  let hostName: string | null = null;
  const creatorId = typeof data.creator_id === "string" ? data.creator_id : null;
  if (data.show_creator_name !== false && creatorId) {
    const { data: profile } = await admin
      .from("users")
      .select("name, first_name, last_name")
      .eq("id", creatorId)
      .maybeSingle();
    if (isRecord(profile)) {
      hostName = hostNameFromProfile(profile);
    }
  }

  const rsvpCount = await countEventRsvps(admin, beaconId);

  return {
    beacon_id: typeof data.id === "string" ? data.id : beaconId,
    title: eventTitleFromMetadata(meta),
    description: eventDescriptionFromMetadata(meta),
    image_url: eventImageFromMetadata(meta),
    host_name: hostName,
    event_start_at: eventStartAtFromMetadata(meta),
    event_end_at: eventEndAtFromMetadata(meta),
    latitude: Number.isFinite(coords.lat) ? coords.lat : null,
    longitude: Number.isFinite(coords.lng) ? coords.lng : null,
    location_name: eventLocationNameFromMetadata(meta),
    rsvp_count: rsvpCount,
    rsvp_enabled: rsvpEnabledFromMetadata(meta),
    expires_at: typeof data.expires_at === "string" ? data.expires_at : null,
    created_at: typeof data.created_at === "string" ? data.created_at : null,
    timezone: eventTimezoneFromMetadata(meta),
  };
}

export type PublicEventListItem = {
  beacon_id: string;
  title: string | null;
  description: string | null;
  image_url: string | null;
  host_name: string | null;
  event_start_at: string | null;
  event_end_at: string | null;
  location_name: string | null;
  latitude: number | null;
  longitude: number | null;
  rsvp_count: number;
  rsvp_enabled: boolean;
};

export async function loadPublicUpcomingEvents(
  admin: SupabaseClient,
  limit = 40,
): Promise<PublicEventListItem[]> {
  const { data, error } = await admin
    .from("map_beacons")
    .select(
      "id, beacon_type, metadata, location, visibility_audience, expires_at, creator_id, show_creator_name",
    )
    .eq("beacon_type", "event")
    .eq("visibility_audience", "everyone")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error || !Array.isArray(data)) return [];

  const now = Date.now();
  const pending: Array<{
    beacon_id: string;
    title: string | null;
    description: string | null;
    image_url: string | null;
    event_start_at: string | null;
    event_end_at: string | null;
    location_name: string | null;
    latitude: number | null;
    longitude: number | null;
    rsvp_enabled: boolean;
    creator_id: string | null;
    show_creator_name: boolean;
  }> = [];

  for (const row of data) {
    if (!isRecord(row)) continue;
    const meta = parseBeaconMetadata(row.metadata);
    if (!isUpcomingEvent(meta, now)) continue;
    const coords = parseLatLngFromLocationField(row.location, Number.NaN, Number.NaN);
    pending.push({
      beacon_id: typeof row.id === "string" ? row.id : "",
      title: eventTitleFromMetadata(meta),
      description: eventDescriptionFromMetadata(meta),
      image_url: eventImageFromMetadata(meta),
      event_start_at: eventStartAtFromMetadata(meta),
      event_end_at: eventEndAtFromMetadata(meta),
      location_name: eventLocationNameFromMetadata(meta),
      latitude: Number.isFinite(coords.lat) ? coords.lat : null,
      longitude: Number.isFinite(coords.lng) ? coords.lng : null,
      rsvp_enabled: rsvpEnabledFromMetadata(meta),
      creator_id: typeof row.creator_id === "string" ? row.creator_id : null,
      show_creator_name: row.show_creator_name !== false,
    });
    if (pending.length >= limit) break;
  }

  const rsvpCounts = await countEventRsvpsByBeaconIds(
    admin,
    pending.map((item) => item.beacon_id),
  );
  const hostIds = pending
    .filter((item) => item.show_creator_name && item.creator_id)
    .map((item) => item.creator_id as string);
  const hostNames = await loadHostNamesByCreatorIds(admin, hostIds);

  const items: PublicEventListItem[] = pending.map((item) => ({
    beacon_id: item.beacon_id,
    title: item.title,
    description: item.description,
    image_url: item.image_url,
    host_name: item.show_creator_name && item.creator_id ? hostNames.get(item.creator_id) ?? null : null,
    event_start_at: item.event_start_at,
    event_end_at: item.event_end_at,
    location_name: item.location_name,
    latitude: item.latitude,
    longitude: item.longitude,
    rsvp_count: rsvpCounts.get(item.beacon_id) ?? 0,
    rsvp_enabled: item.rsvp_enabled,
  }));

  items.sort((a, b) => {
    const aMs = a.event_start_at ? Date.parse(a.event_start_at) : Number.POSITIVE_INFINITY;
    const bMs = b.event_start_at ? Date.parse(b.event_start_at) : Number.POSITIVE_INFINITY;
    return aMs - bMs;
  });
  return items;
}
