import type { SupabaseClient } from "@supabase/supabase-js";
import { parseLatLngFromLocationField } from "@/lib/map/mapBeaconApiShared";
import {
  eventDescriptionFromMetadata,
  eventEndAtFromMetadata,
  eventImageFromMetadata,
  eventLocationNameFromMetadata,
  eventStartAtFromMetadata,
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
};

export async function countEventRsvps(
  admin: SupabaseClient,
  beaconId: string,
): Promise<number> {
  const [{ count: clickCount }, { count: guestCount }] = await Promise.all([
    admin
      .from("beacon_attendees")
      .select("user_id", { count: "exact", head: true })
      .eq("beacon_id", beaconId),
    admin
      .from("event_guest_rsvps")
      .select("id", { count: "exact", head: true })
      .eq("beacon_id", beaconId),
  ]);
  return (clickCount ?? 0) + (guestCount ?? 0);
}

export async function loadPublicEventPayload(
  admin: SupabaseClient,
  beaconId: string,
): Promise<PublicEventPayload | null> {
  const { data, error } = await admin
    .from("map_beacons")
    .select(
      "id, beacon_type, metadata, location, show_creator_name, creator_id, expires_at, visibility_audience",
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
      const first = typeof profile.first_name === "string" ? profile.first_name.trim() : "";
      const last = typeof profile.last_name === "string" ? profile.last_name.trim() : "";
      const combined = [first, last].filter(Boolean).join(" ").trim();
      hostName = combined || metaString(profile, "name");
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
  };
}

export type PublicEventListItem = {
  beacon_id: string;
  title: string | null;
  description: string | null;
  image_url: string | null;
  event_start_at: string | null;
  event_end_at: string | null;
  location_name: string | null;
  latitude: number | null;
  longitude: number | null;
};

export async function loadPublicUpcomingEvents(
  admin: SupabaseClient,
  limit = 40,
): Promise<PublicEventListItem[]> {
  const { data, error } = await admin
    .from("map_beacons")
    .select("id, beacon_type, metadata, location, visibility_audience, expires_at")
    .eq("beacon_type", "event")
    .eq("visibility_audience", "everyone")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error || !Array.isArray(data)) return [];

  const now = Date.now();
  const items: PublicEventListItem[] = [];
  for (const row of data) {
    if (!isRecord(row)) continue;
    const meta = parseBeaconMetadata(row.metadata);
    if (!isUpcomingEvent(meta, now)) continue;
    const coords = parseLatLngFromLocationField(row.location, Number.NaN, Number.NaN);
    items.push({
      beacon_id: typeof row.id === "string" ? row.id : "",
      title: eventTitleFromMetadata(meta),
      description: eventDescriptionFromMetadata(meta),
      image_url: eventImageFromMetadata(meta),
      event_start_at: eventStartAtFromMetadata(meta),
      event_end_at: eventEndAtFromMetadata(meta),
      location_name: eventLocationNameFromMetadata(meta),
      latitude: Number.isFinite(coords.lat) ? coords.lat : null,
      longitude: Number.isFinite(coords.lng) ? coords.lng : null,
    });
    if (items.length >= limit) break;
  }

  items.sort((a, b) => {
    const aMs = a.event_start_at ? Date.parse(a.event_start_at) : Number.POSITIVE_INFINITY;
    const bMs = b.event_start_at ? Date.parse(b.event_start_at) : Number.POSITIVE_INFINITY;
    return aMs - bMs;
  });
  return items;
}
