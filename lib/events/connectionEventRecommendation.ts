import type { SupabaseClient } from "@supabase/supabase-js";
import { haversineMeters, eventScheduleBounds } from "@/lib/server/eventEngagement";
import { parseLatLngFromLocationField } from "@/lib/map/mapBeaconApiShared";
import { getSharedInterestTags } from "@/lib/userProfile/sharedInterests";
import { displayNameFromUser, type UserProfileRow } from "@/lib/events/attendeeDirectory";

export type ConnectionEventRecommendation = {
  beacon_id: string;
  title: string;
  event_start_at: string | null;
  event_end_at: string | null;
  location_name: string | null;
  peer_name: string;
  peer_user_id: string;
  score: number;
  shared_category_tags: string[];
};

export type EventRecommendationCandidate = {
  beacon_id: string;
  title: string;
  event_start_at: string | null;
  event_end_at: string | null;
  location_name: string | null;
  lat: number | null;
  lng: number | null;
  category_tags: string[];
};

/** Max distance (m) that still earns a proximity bonus. */
export const DISTANCE_BONUS_RANGE_METERS = 5000;
/** Proximity contribution scales so max bonus ≈ 10 at distance 0. */
export const DISTANCE_BONUS_SCALE = 500;

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function metaStr(meta: Record<string, unknown>, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = meta[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

/** Parse event category / interest tags from beacon metadata. */
export function parseEventCategoryTags(metadata: Record<string, unknown>): string[] {
  const raw =
    metadata.event_categories ??
    metadata.eventCategories ??
    metadata.categories ??
    metadata.interest_tags ??
    metadata.interestTags ??
    metadata.tags;

  if (typeof raw === "string") {
    const t = raw.trim();
    return t.length > 0 ? [t] : [];
  }
  if (!Array.isArray(raw)) return [];

  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    let label: string | null = null;
    if (typeof item === "string") {
      label = item.trim();
    } else if (isRecord(item)) {
      const nested = item.tag ?? item.name ?? item.label ?? item.id;
      if (typeof nested === "string") label = nested.trim();
    }
    if (label == null || label.length === 0) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(label);
  }
  return out;
}

export function parseEventLocationName(metadata: Record<string, unknown>): string | null {
  const raw = metaStr(
    metadata,
    "location_name",
    "locationName",
    "venue_name",
    "venueName",
    "place_name",
    "placeName",
    "formatted_address",
    "formattedAddress",
    "address",
  );
  if (raw == null) return null;
  // Never surface the literal placeholder used by legacy "use my location" drops.
  if (raw.toLowerCase() === "current location") return null;
  return raw;
}

export function parseEventTitle(metadata: Record<string, unknown>): string {
  return (
    metaStr(metadata, "title", "event_title", "eventTitle", "label", "name") ?? "Event"
  );
}

/** True when the event has not ended (end_at in future, or no end and not expired by start alone). */
export function isEventNotEnded(
  metadata: Record<string, unknown>,
  nowMs: number = Date.now(),
): boolean {
  const { endMs, startMs } = eventScheduleBounds(metadata);
  if (endMs != null) return nowMs < endMs;
  // No end: treat as not ended (caller may still filter on expires_at).
  if (startMs != null) return true;
  return true;
}

/**
 * Score = shared category overlap * 10 + nearer distance bonus.
 * Distance bonus: max(0, (5000 - meters) / 500), capped contribution when coords missing = 0.
 */
export function scoreEventCandidate(
  candidate: EventRecommendationCandidate,
  viewerInterestTags: string[],
  viewerLat: number | null,
  viewerLng: number | null,
): { score: number; shared_category_tags: string[] } {
  const shared_category_tags = getSharedInterestTags(
    viewerInterestTags,
    candidate.category_tags,
  );
  let score = shared_category_tags.length * 10;

  if (
    viewerLat != null &&
    viewerLng != null &&
    candidate.lat != null &&
    candidate.lng != null
  ) {
    const meters = haversineMeters(viewerLat, viewerLng, candidate.lat, candidate.lng);
    score += Math.max(0, (DISTANCE_BONUS_RANGE_METERS - meters) / DISTANCE_BONUS_SCALE);
  }

  return { score, shared_category_tags };
}

export function compareScoredRecommendations(
  a: Pick<ConnectionEventRecommendation, "score" | "event_start_at" | "beacon_id">,
  b: Pick<ConnectionEventRecommendation, "score" | "event_start_at" | "beacon_id">,
): number {
  if (b.score !== a.score) return b.score - a.score;
  const aStart = a.event_start_at != null ? Date.parse(a.event_start_at) : Number.POSITIVE_INFINITY;
  const bStart = b.event_start_at != null ? Date.parse(b.event_start_at) : Number.POSITIVE_INFINITY;
  const aOk = Number.isFinite(aStart) ? aStart : Number.POSITIVE_INFINITY;
  const bOk = Number.isFinite(bStart) ? bStart : Number.POSITIVE_INFINITY;
  if (aOk !== bOk) return aOk - bOk;
  return a.beacon_id.localeCompare(b.beacon_id);
}

/** Pick top-1 recommendation from scored candidates (sooner start breaks ties). */
export function pickTopRecommendation(
  candidates: EventRecommendationCandidate[],
  viewerInterestTags: string[],
  peerUserId: string,
  peerName: string,
  viewerLat: number | null = null,
  viewerLng: number | null = null,
): ConnectionEventRecommendation | null {
  if (candidates.length === 0) return null;

  const scored: ConnectionEventRecommendation[] = candidates.map((c) => {
    const { score, shared_category_tags } = scoreEventCandidate(
      c,
      viewerInterestTags,
      viewerLat,
      viewerLng,
    );
    return {
      beacon_id: c.beacon_id,
      title: c.title,
      event_start_at: c.event_start_at,
      event_end_at: c.event_end_at,
      location_name: c.location_name,
      peer_name: peerName,
      peer_user_id: peerUserId,
      score,
      shared_category_tags,
    };
  });

  scored.sort(compareScoredRecommendations);
  return scored[0] ?? null;
}

function parseProfile(raw: unknown): UserProfileRow | null {
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

function parseBeaconCoords(row: Record<string, unknown>): {
  lat: number | null;
  lng: number | null;
} {
  const latDirect =
    typeof row.lat === "number"
      ? row.lat
      : typeof row.latitude === "number"
        ? row.latitude
        : null;
  const lngDirect =
    typeof row.lng === "number"
      ? row.lng
      : typeof row.longitude === "number"
        ? row.longitude
        : null;
  if (
    latDirect != null &&
    lngDirect != null &&
    Number.isFinite(latDirect) &&
    Number.isFinite(lngDirect)
  ) {
    return { lat: latDirect, lng: lngDirect };
  }
  const parsed = parseLatLngFromLocationField(row.location, Number.NaN, Number.NaN);
  if (Number.isFinite(parsed.lat) && Number.isFinite(parsed.lng)) {
    return { lat: parsed.lat, lng: parsed.lng };
  }
  return { lat: null, lng: null };
}

/**
 * Recommend one future peer RSVP event the viewer has not already RSVP'd or bookmarked.
 */
export async function recommendConnectionEvent(
  admin: SupabaseClient,
  viewerId: string,
  peerId: string,
  viewerLat: number | null = null,
  viewerLng: number | null = null,
  nowMs: number = Date.now(),
): Promise<ConnectionEventRecommendation | null> {
  const { data: peerRsvps, error: rsvpErr } = await admin
    .from("beacon_attendees")
    .select("beacon_id")
    .eq("user_id", peerId);

  if (rsvpErr) {
    console.error("recommendConnectionEvent peer RSVPs:", rsvpErr.message);
    return null;
  }

  const peerBeaconIds = (Array.isArray(peerRsvps) ? peerRsvps : [])
    .map((row) => (isRecord(row) && typeof row.beacon_id === "string" ? row.beacon_id : null))
    .filter((id): id is string => id != null);

  if (peerBeaconIds.length === 0) return null;

  const [{ data: viewerRsvps }, { data: viewerBookmarks }, { data: beacons }, { data: interests }] =
    await Promise.all([
      admin.from("beacon_attendees").select("beacon_id").eq("user_id", viewerId),
      admin.from("event_bookmarks").select("beacon_id").eq("user_id", viewerId),
      admin
        .from("map_beacons")
        .select("id, beacon_type, metadata, location, expires_at")
        .in("id", peerBeaconIds)
        .eq("beacon_type", "event"),
      admin.from("user_interests").select("tags").eq("user_id", viewerId).maybeSingle(),
    ]);

  const exclude = new Set<string>();
  for (const row of Array.isArray(viewerRsvps) ? viewerRsvps : []) {
    if (isRecord(row) && typeof row.beacon_id === "string") exclude.add(row.beacon_id);
  }
  for (const row of Array.isArray(viewerBookmarks) ? viewerBookmarks : []) {
    if (isRecord(row) && typeof row.beacon_id === "string") exclude.add(row.beacon_id);
  }

  const viewerTags =
    isRecord(interests) && Array.isArray(interests.tags)
      ? interests.tags.filter((t): t is string => typeof t === "string" && t.trim().length > 0)
      : [];

  const { data: peerProfileRaw } = await admin
    .from("users")
    .select("id, name, image, first_name, last_name")
    .eq("id", peerId)
    .maybeSingle();
  const peerProfile = parseProfile(peerProfileRaw);
  const peerName = displayNameFromUser(peerProfile, "Connection");

  const candidates: EventRecommendationCandidate[] = [];
  for (const raw of Array.isArray(beacons) ? beacons : []) {
    if (!isRecord(raw) || typeof raw.id !== "string") continue;
    if (exclude.has(raw.id)) continue;

    const metadata = isRecord(raw.metadata) ? raw.metadata : {};
    if (!isEventNotEnded(metadata, nowMs)) continue;

    const expRaw = raw.expires_at;
    if (typeof expRaw === "string") {
      const exp = Date.parse(expRaw);
      if (Number.isFinite(exp) && exp <= nowMs) continue;
    }

    const { startMs, endMs } = eventScheduleBounds(metadata);
    const coords = parseBeaconCoords(raw);

    candidates.push({
      beacon_id: raw.id,
      title: parseEventTitle(metadata),
      event_start_at:
        startMs != null
          ? new Date(startMs).toISOString()
          : metaStr(metadata, "event_start_at", "eventStartAt"),
      event_end_at:
        endMs != null
          ? new Date(endMs).toISOString()
          : metaStr(metadata, "event_end_at", "eventEndAt"),
      location_name: parseEventLocationName(metadata),
      lat: coords.lat,
      lng: coords.lng,
      category_tags: parseEventCategoryTags(metadata),
    });
  }

  return pickTopRecommendation(
    candidates,
    viewerTags,
    peerId,
    peerName,
    viewerLat,
    viewerLng,
  );
}
