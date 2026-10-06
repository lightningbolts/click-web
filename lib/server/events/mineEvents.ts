import type { SupabaseClient } from "@supabase/supabase-js";
import { parseLatLngFromLocationField } from "@/lib/map/mapBeaconApiShared";
import {
  eventDescriptionFromMetadata,
  eventDisplayTitle,
  eventEndAtFromMetadata,
  eventImageFromMetadata,
  eventInstantFromRowOrMeta,
  eventLocationNameFromMetadata,
  eventStartAtFromMetadata,
  eventTitleFromMetadata,
  isRecord,
  parseBeaconMetadata,
  rsvpEnabledFromMetadata,
} from "@/lib/events/eventMetadata";
import { countEventRsvpsByBeaconIds } from "@/lib/events/publicEvent";

export type MineEvent = {
  beacon_id: string;
  title: string | null;
  description: string | null;
  image_url: string | null;
  event_start_at: string | null;
  event_end_at: string | null;
  location_name: string | null;
  latitude: number | null;
  longitude: number | null;
  rsvp_count: number;
  rsvp_enabled: boolean;
  role: "creator" | "rsvp";
};

/** Events the user created or RSVPed to, newest start first (`GET /api/beacons/mine`, Home). */
export async function loadMineEvents(admin: SupabaseClient, userId: string): Promise<MineEvent[]> {
  const [{ data: created, error: createdErr }, { data: rsvps }] = await Promise.all([
    admin
      .from("map_beacons")
      .select("id, metadata, location, beacon_type, starts_at, ends_at")
      .eq("creator_id", userId)
      .eq("beacon_type", "event")
      .order("created_at", { ascending: false })
      .limit(50),
    admin.from("beacon_attendees").select("beacon_id").eq("user_id", userId).limit(50),
  ]);

  if (createdErr) throw new Error(`mine events: ${createdErr.message}`);

  const rsvpIds = (Array.isArray(rsvps) ? rsvps : [])
    .map((row) => (isRecord(row) && typeof row.beacon_id === "string" ? row.beacon_id : null))
    .filter((id): id is string => id != null);

  let rsvpBeacons: unknown[] = [];
  if (rsvpIds.length > 0) {
    const { data } = await admin
      .from("map_beacons")
      .select("id, metadata, location, beacon_type, starts_at, ends_at")
      .in("id", rsvpIds)
      .eq("beacon_type", "event");
    rsvpBeacons = Array.isArray(data) ? data : [];
  }

  const byId = new Map<string, MineEvent>();
  const createdRows = Array.isArray(created) ? created : [];
  const rsvpCountById = await countEventRsvpsByBeaconIds(
    admin,
    [...createdRows, ...rsvpBeacons]
      .map((row) => (isRecord(row) && typeof row.id === "string" ? row.id : null))
      .filter((id): id is string => id != null),
  );

  const toItem = (row: unknown, role: "creator" | "rsvp"): void => {
    if (!isRecord(row) || typeof row.id !== "string") return;
    if (byId.has(row.id) && role === "rsvp") return;
    const meta = parseBeaconMetadata(row.metadata);
    const coords = parseLatLngFromLocationField(row.location, Number.NaN, Number.NaN);
    byId.set(row.id, {
      beacon_id: row.id,
      title: eventDisplayTitle(
        eventTitleFromMetadata(meta),
        eventLocationNameFromMetadata(meta),
        eventDescriptionFromMetadata(meta),
      ),
      description: eventDescriptionFromMetadata(meta),
      image_url: eventImageFromMetadata(meta),
      event_start_at: eventInstantFromRowOrMeta(row.starts_at, eventStartAtFromMetadata(meta)),
      event_end_at: eventInstantFromRowOrMeta(row.ends_at, eventEndAtFromMetadata(meta)),
      location_name: eventLocationNameFromMetadata(meta),
      latitude: Number.isFinite(coords.lat) ? coords.lat : null,
      longitude: Number.isFinite(coords.lng) ? coords.lng : null,
      rsvp_count: rsvpCountById.get(row.id) ?? 0,
      rsvp_enabled: rsvpEnabledFromMetadata(meta),
      role: byId.get(row.id)?.role === "creator" ? "creator" : role,
    });
  };

  for (const row of createdRows) {
    toItem(row, "creator");
  }
  for (const row of rsvpBeacons) {
    toItem(row, "rsvp");
  }

  const events = [...byId.values()].sort((a, b) => {
    const aMs = a.event_start_at ? Date.parse(a.event_start_at) : 0;
    const bMs = b.event_start_at ? Date.parse(b.event_start_at) : 0;
    return bMs - aMs;
  });

  return events;
}
