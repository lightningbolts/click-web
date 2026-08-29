import type { SupabaseClient } from "@supabase/supabase-js";
import { parseLatLngFromLocationField } from "@/lib/map/mapBeaconApiShared";
import {
  DEFAULT_EVENT_LISTING_OPTIONS,
  EVENT_COVER_THEME_IDS,
  eventCategoriesFromMetadata,
  parseEventListingOptions,
} from "@/lib/events/eventOptions";
import {
  eventDescriptionFromMetadata,
  eventEndAtFromMetadata,
  eventImageFromMetadata,
  eventInstantFromRowOrMeta,
  eventLocationNameFromMetadata,
  eventStartAtFromMetadata,
  eventTimezoneFromMetadata,
  eventTitleFromMetadata,
  isRecord,
  parseBeaconMetadata,
} from "@/lib/events/eventMetadata";
import { DEFAULT_VENUE_SCALE, isVenueScale } from "@/lib/server/eventEngagement";
import { resolvedTimeZone } from "@/lib/events/eventScheduleUi";
import type { EventFormDraft, EventVenueScale } from "@/lib/events/eventFormDraft";

function fallbackWindowIso(): { startIso: string; endIso: string } {
  const start = new Date();
  start.setMinutes(0, 0, 0);
  start.setHours(start.getHours() + 1);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

export async function loadEventEditDraft(
  admin: SupabaseClient,
  beaconId: string,
): Promise<EventFormDraft | null> {
  const { data, error } = await admin
    .from("map_beacons")
    .select(
      "id, beacon_type, metadata, location, show_creator_name, starts_at, ends_at, event_timezone, event_visibility, event_capacity, approval_required, guest_list_visibility, cover_theme_id",
    )
    .eq("id", beaconId)
    .maybeSingle();

  if (error || !isRecord(data) || data.beacon_type !== "event") return null;

  const meta = parseBeaconMetadata(data.metadata);
  const listing = parseEventListingOptions(data, meta);
  const coords = parseLatLngFromLocationField(data.location, Number.NaN, Number.NaN);
  const fallback = fallbackWindowIso();
  const startIso =
    eventInstantFromRowOrMeta(data.starts_at, eventStartAtFromMetadata(meta)) ?? fallback.startIso;
  const endIso =
    eventInstantFromRowOrMeta(data.ends_at, eventEndAtFromMetadata(meta)) ?? fallback.endIso;
  const coverThemeId =
    listing.cover_theme_id && (EVENT_COVER_THEME_IDS as readonly string[]).includes(listing.cover_theme_id)
      ? listing.cover_theme_id
      : EVENT_COVER_THEME_IDS[0];
  const scaleRaw = meta.venue_scale ?? meta.venueScale;
  const venueScale: EventVenueScale = isVenueScale(scaleRaw) ? scaleRaw : DEFAULT_VENUE_SCALE;

  return {
    title: eventTitleFromMetadata(meta) ?? "",
    description: eventDescriptionFromMetadata(meta) ?? "",
    startIso,
    endIso,
    timeZone:
      (typeof data.event_timezone === "string" && data.event_timezone.trim()) ||
      eventTimezoneFromMetadata(meta) ||
      resolvedTimeZone(),
    locationName: eventLocationNameFromMetadata(meta) ?? "",
    lat: Number.isFinite(coords.lat) ? String(coords.lat) : "",
    lng: Number.isFinite(coords.lng) ? String(coords.lng) : "",
    imageUrl: eventImageFromMetadata(meta),
    coverThemeId,
    visibility: listing.event_visibility ?? DEFAULT_EVENT_LISTING_OPTIONS.event_visibility,
    capacity: listing.event_capacity,
    approvalRequired: listing.approval_required,
    guestListVisibility: listing.guest_list_visibility,
    showCreatorName: data.show_creator_name !== false,
    venueScale,
    categories: eventCategoriesFromMetadata(meta),
  };
}
