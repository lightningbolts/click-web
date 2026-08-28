import type { SupabaseClient } from "@supabase/supabase-js";
import { parseLatLngFromLocationField } from "@/lib/map/mapBeaconApiShared";
import {
  eventDescriptionFromMetadata,
  eventEndAtFromMetadata,
  eventImageFromMetadata,
  eventLocationNameFromMetadata,
  eventInstantFromRowOrMeta,
  eventStartAtFromMetadata,
  eventTimezoneFromMetadata,
  eventTitleFromMetadata,
  isRecord,
  isUpcomingEvent,
  metaString,
  parseBeaconMetadata,
  parseIsoMs,
  rsvpEnabledFromMetadata,
} from "@/lib/events/eventMetadata";
import {
  coverVisualSeed,
  parseEventListingOptions,
  type EventListingOptions,
} from "@/lib/events/eventOptions";

export type EventAttendeePreview = {
  user_id: string;
  name: string;
  avatar_url: string | null;
};

export type PublicEventPayload = {
  beacon_id: string;
  title: string | null;
  description: string | null;
  image_url: string | null;
  host_name: string | null;
  host_avatar_url: string | null;
  creator_id: string | null;
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
  cover_theme_id: string | null;
  visual_seed: string;
  attendees: EventAttendeePreview[];
  listing: EventListingOptions;
};

export type PublicEventListItem = {
  beacon_id: string;
  title: string | null;
  description: string | null;
  image_url: string | null;
  host_name: string | null;
  host_avatar_url: string | null;
  event_start_at: string | null;
  event_end_at: string | null;
  location_name: string | null;
  latitude: number | null;
  longitude: number | null;
  rsvp_count: number;
  rsvp_enabled: boolean;
  cover_theme_id: string | null;
  visual_seed: string;
  attendees: EventAttendeePreview[];
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

type HostProfile = { name: string | null; image: string | null };

async function loadHostProfilesByCreatorIds(
  admin: SupabaseClient,
  creatorIds: string[],
): Promise<Map<string, HostProfile>> {
  const unique = [...new Set(creatorIds.filter(Boolean))];
  const names = new Map<string, HostProfile>();
  if (unique.length === 0) return names;
  const { data } = await admin
    .from("users")
    .select("id, name, first_name, last_name, image")
    .in("id", unique);
  if (!Array.isArray(data)) return names;
  for (const row of data) {
    if (!isRecord(row) || typeof row.id !== "string") continue;
    names.set(row.id, {
      name: hostNameFromProfile(row),
      image: typeof row.image === "string" && row.image.trim() ? row.image.trim() : null,
    });
  }
  return names;
}

function isUpcomingFromRow(
  row: Record<string, unknown>,
  meta: Record<string, unknown>,
  nowMs: number,
): boolean {
  const end = parseIsoMs(eventInstantFromRowOrMeta(row.ends_at, eventEndAtFromMetadata(meta)));
  if (end != null) return end >= nowMs;
  const start = parseIsoMs(eventInstantFromRowOrMeta(row.starts_at, eventStartAtFromMetadata(meta)));
  if (start != null) return start >= nowMs - 6 * 60 * 60 * 1000;
  return isUpcomingEvent(meta, nowMs);
}

function sortInstantMs(eventEndAt: string | null, eventStartAt: string | null): number {
  const end = eventEndAt ? Date.parse(eventEndAt) : NaN;
  if (Number.isFinite(end)) return end;
  const start = eventStartAt ? Date.parse(eventStartAt) : NaN;
  if (Number.isFinite(start)) return start;
  return 0;
}

async function loadAttendeePreviewsByBeaconIds(
  admin: SupabaseClient,
  beaconIds: string[],
  perEvent = 5,
): Promise<Map<string, EventAttendeePreview[]>> {
  const unique = [...new Set(beaconIds.filter(Boolean))];
  const out = new Map<string, EventAttendeePreview[]>();
  for (const id of unique) out.set(id, []);
  if (unique.length === 0) return out;

  const { data } = await admin
    .from("beacon_attendees")
    .select("beacon_id, user_id, created_at")
    .in("beacon_id", unique)
    .order("created_at", { ascending: true });
  if (!Array.isArray(data)) return out;

  const picked: Array<{ beacon_id: string; user_id: string }> = [];
  const per = new Map<string, number>();
  for (const row of data) {
    if (!isRecord(row) || typeof row.beacon_id !== "string" || typeof row.user_id !== "string") continue;
    const n = per.get(row.beacon_id) ?? 0;
    if (n >= perEvent) continue;
    per.set(row.beacon_id, n + 1);
    picked.push({ beacon_id: row.beacon_id, user_id: row.user_id });
  }
  const userIds = [...new Set(picked.map((row) => row.user_id))];
  if (userIds.length === 0) return out;
  const { data: profiles } = await admin
    .from("users")
    .select("id, name, first_name, last_name, image")
    .in("id", userIds);
  const byId = new Map<string, EventAttendeePreview>();
  if (Array.isArray(profiles)) {
    for (const row of profiles) {
      if (!isRecord(row) || typeof row.id !== "string") continue;
      byId.set(row.id, {
        user_id: row.id,
        name: hostNameFromProfile(row) || "Attendee",
        avatar_url: typeof row.image === "string" && row.image.trim() ? row.image.trim() : null,
      });
    }
  }
  for (const row of picked) {
    const preview = byId.get(row.user_id) ?? {
      user_id: row.user_id,
      name: "Attendee",
      avatar_url: null,
    };
    out.get(row.beacon_id)?.push(preview);
  }
  return out;
}

export async function loadPublicEventPayload(
  admin: SupabaseClient,
  beaconId: string,
): Promise<PublicEventPayload | null> {
  const { data, error } = await admin
    .from("map_beacons")
    .select(
      "id, beacon_type, metadata, location, show_creator_name, creator_id, expires_at, visibility_audience, created_at, starts_at, ends_at, event_timezone, event_visibility, event_capacity, approval_required, guest_list_visibility, cover_theme_id",
    )
    .eq("id", beaconId)
    .maybeSingle();

  if (error || !isRecord(data) || data.beacon_type !== "event") {
    return null;
  }

  const meta = parseBeaconMetadata(data.metadata);
  const listing = parseEventListingOptions(data, meta);
  const coords = parseLatLngFromLocationField(data.location, Number.NaN, Number.NaN);

  let hostName: string | null = null;
  let hostAvatar: string | null = null;
  const creatorId = typeof data.creator_id === "string" ? data.creator_id : null;
  if (data.show_creator_name !== false && creatorId) {
    const { data: profile } = await admin
      .from("users")
      .select("name, first_name, last_name, image")
      .eq("id", creatorId)
      .maybeSingle();
    if (isRecord(profile)) {
      hostName = hostNameFromProfile(profile);
      hostAvatar = typeof profile.image === "string" && profile.image.trim() ? profile.image.trim() : null;
    }
  }

  const rsvpCount = await countEventRsvps(admin, beaconId);
  const previews =
    listing.guest_list_visibility === "public"
      ? (await loadAttendeePreviewsByBeaconIds(admin, [beaconId])).get(beaconId) ?? []
      : [];
  const coverThemeId = listing.cover_theme_id;
  const startAt = eventInstantFromRowOrMeta(data.starts_at, eventStartAtFromMetadata(meta));
  const endAt = eventInstantFromRowOrMeta(data.ends_at, eventEndAtFromMetadata(meta));
  const timezone =
    (typeof data.event_timezone === "string" && data.event_timezone.trim()) ||
    eventTimezoneFromMetadata(meta);

  return {
    beacon_id: typeof data.id === "string" ? data.id : beaconId,
    title: eventTitleFromMetadata(meta),
    description: eventDescriptionFromMetadata(meta),
    image_url: eventImageFromMetadata(meta),
    host_name: hostName,
    host_avatar_url: hostAvatar,
    creator_id: creatorId,
    event_start_at: startAt,
    event_end_at: endAt,
    latitude: Number.isFinite(coords.lat) ? coords.lat : null,
    longitude: Number.isFinite(coords.lng) ? coords.lng : null,
    location_name: eventLocationNameFromMetadata(meta),
    rsvp_count: rsvpCount,
    rsvp_enabled: rsvpEnabledFromMetadata(meta),
    expires_at: typeof data.expires_at === "string" ? data.expires_at : null,
    created_at: typeof data.created_at === "string" ? data.created_at : null,
    timezone,
    cover_theme_id: coverThemeId,
    visual_seed: coverVisualSeed(typeof data.id === "string" ? data.id : beaconId, coverThemeId),
    attendees: previews,
    listing,
  };
}

type PublicEventTemporal = "upcoming" | "past";

async function loadPublicDiscoverableEvents(
  admin: SupabaseClient,
  temporal: PublicEventTemporal,
  limit = 40,
): Promise<PublicEventListItem[]> {
  const { data, error } = await admin
    .from("map_beacons")
    .select(
      "id, beacon_type, metadata, location, visibility_audience, expires_at, creator_id, show_creator_name, starts_at, ends_at, event_timezone, event_visibility, cover_theme_id, guest_list_visibility",
    )
    .eq("beacon_type", "event")
    .eq("visibility_audience", "everyone")
    .eq("event_visibility", "public")
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
    cover_theme_id: string | null;
    timezone: string | null;
    guest_list_public: boolean;
  }> = [];

  for (const row of data) {
    if (!isRecord(row)) continue;
    const meta = parseBeaconMetadata(row.metadata);
    const listing = parseEventListingOptions(row, meta);
    if (listing.event_visibility !== "public") continue;
    const isUpcoming = isUpcomingFromRow(row, meta, now);
    if (temporal === "upcoming" && !isUpcoming) continue;
    if (temporal === "past" && isUpcoming) continue;
    const coords = parseLatLngFromLocationField(row.location, Number.NaN, Number.NaN);
    const beaconId = typeof row.id === "string" ? row.id : "";
    pending.push({
      beacon_id: beaconId,
      title: eventTitleFromMetadata(meta),
      description: eventDescriptionFromMetadata(meta),
      image_url: eventImageFromMetadata(meta),
      event_start_at: eventInstantFromRowOrMeta(row.starts_at, eventStartAtFromMetadata(meta)),
      event_end_at: eventInstantFromRowOrMeta(row.ends_at, eventEndAtFromMetadata(meta)),
      location_name: eventLocationNameFromMetadata(meta),
      latitude: Number.isFinite(coords.lat) ? coords.lat : null,
      longitude: Number.isFinite(coords.lng) ? coords.lng : null,
      rsvp_enabled: rsvpEnabledFromMetadata(meta),
      creator_id: typeof row.creator_id === "string" ? row.creator_id : null,
      show_creator_name: row.show_creator_name !== false,
      cover_theme_id: listing.cover_theme_id,
      timezone:
        (typeof row.event_timezone === "string" && row.event_timezone.trim()) ||
        eventTimezoneFromMetadata(meta),
      guest_list_public: listing.guest_list_visibility === "public",
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
  const hostProfiles = await loadHostProfilesByCreatorIds(admin, hostIds);
  const previewIds = pending.filter((item) => item.guest_list_public).map((item) => item.beacon_id);
  const previews = await loadAttendeePreviewsByBeaconIds(admin, previewIds);

  const items: PublicEventListItem[] = pending.map((item) => {
    const host = item.show_creator_name && item.creator_id ? hostProfiles.get(item.creator_id) : null;
    return {
      beacon_id: item.beacon_id,
      title: item.title,
      description: item.description,
      image_url: item.image_url,
      host_name: host?.name ?? null,
      host_avatar_url: host?.image ?? null,
      event_start_at: item.event_start_at,
      event_end_at: item.event_end_at,
      location_name: item.location_name,
      latitude: item.latitude,
      longitude: item.longitude,
      rsvp_count: rsvpCounts.get(item.beacon_id) ?? 0,
      rsvp_enabled: item.rsvp_enabled,
      cover_theme_id: item.cover_theme_id,
      visual_seed: coverVisualSeed(item.beacon_id, item.cover_theme_id),
      attendees: item.guest_list_public ? previews.get(item.beacon_id) ?? [] : [],
      timezone: item.timezone,
    };
  });

  items.sort((a, b) => {
    const aMs = sortInstantMs(a.event_end_at, a.event_start_at);
    const bMs = sortInstantMs(b.event_end_at, b.event_start_at);
    return temporal === "past" ? bMs - aMs : aMs - bMs;
  });
  return items;
}

export async function loadPublicUpcomingEvents(
  admin: SupabaseClient,
  limit = 40,
): Promise<PublicEventListItem[]> {
  return loadPublicDiscoverableEvents(admin, "upcoming", limit);
}

export async function loadPublicPastEvents(
  admin: SupabaseClient,
  limit = 40,
): Promise<PublicEventListItem[]> {
  return loadPublicDiscoverableEvents(admin, "past", limit);
}
