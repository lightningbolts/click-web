import { type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { parseLatLngFromLocationField } from "@/lib/map/mapBeaconApiShared";

export const EVENT_BEACON_UUID_RE = /^[0-9a-fA-F-]{36}$/;

export type VenueScale = "intimate" | "neighborhood" | "venue" | "campus";

export const VENUE_SCALE_RADIUS_METERS: Record<VenueScale, number> = {
  intimate: 75,
  neighborhood: 250,
  venue: 750,
  campus: 2500,
};

export const DEFAULT_VENUE_SCALE: VenueScale = "neighborhood";
export const CHECK_IN_RADIUS_MIN_M = 25;
export const CHECK_IN_RADIUS_MAX_M = 5000;
/**
 * Early window before event_start_at for check-in (ms).
 * Geofence still required — early arrivals at the venue can check in.
 */
export const CHECK_IN_EARLY_GRACE_MS = 24 * 60 * 60 * 1000;

export type EventEngagementEventType =
  | "event_view"
  | "bookmark_set"
  | "bookmark_unset"
  | "rsvp_set"
  | "rsvp_unset"
  | "check_in"
  | "check_out"
  | "check_in_rejected"
  | "share";

export type EngagementTelemetryBody = {
  latitude: number | null;
  longitude: number | null;
  accuracy_meters: number | null;
  client_occurred_at: string | null;
  source: string | null;
  platform: string | null;
  app_version: string | null;
  surface: string | null;
  bookmarked?: boolean | null;
};

export type EventBeaconRow = {
  id: string;
  beacon_type: string;
  expires_at: string | null;
  venue_id: string | null;
  metadata: Record<string, unknown>;
  lat: number | null;
  lng: number | null;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

export function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function isVenueScale(v: unknown): v is VenueScale {
  return v === "intimate" || v === "neighborhood" || v === "venue" || v === "campus";
}

export function resolveCheckInRadiusMeters(metadata: Record<string, unknown>): {
  radiusMeters: number;
  venueScale: VenueScale;
} {
  const explicit = metadata.check_in_radius_meters ?? metadata.checkInRadiusMeters;
  const explicitNum =
    typeof explicit === "number"
      ? explicit
      : typeof explicit === "string"
        ? Number(explicit)
        : NaN;
  if (Number.isFinite(explicitNum)) {
    const clamped = Math.min(
      CHECK_IN_RADIUS_MAX_M,
      Math.max(CHECK_IN_RADIUS_MIN_M, explicitNum),
    );
    const scaleRaw = metadata.venue_scale ?? metadata.venueScale;
    const venueScale = isVenueScale(scaleRaw) ? scaleRaw : DEFAULT_VENUE_SCALE;
    return { radiusMeters: clamped, venueScale };
  }
  const scaleRaw = metadata.venue_scale ?? metadata.venueScale;
  const venueScale = isVenueScale(scaleRaw) ? scaleRaw : DEFAULT_VENUE_SCALE;
  return { radiusMeters: VENUE_SCALE_RADIUS_METERS[venueScale], venueScale };
}

/** Normalize venue_scale + check_in_radius_meters into event metadata at create/edit. */
export function applyVenueScaleToMetadata(
  metadata: Record<string, unknown>,
): Record<string, unknown> {
  const scaleRaw = metadata.venue_scale ?? metadata.venueScale;
  const venueScale = isVenueScale(scaleRaw) ? scaleRaw : DEFAULT_VENUE_SCALE;
  const { radiusMeters } = resolveCheckInRadiusMeters({
    ...metadata,
    venue_scale: venueScale,
  });
  return {
    ...metadata,
    venue_scale: venueScale,
    check_in_radius_meters: radiusMeters,
  };
}

export function parseEngagementTelemetryBody(body: unknown): EngagementTelemetryBody {
  if (!isRecord(body)) {
    return {
      latitude: null,
      longitude: null,
      accuracy_meters: null,
      client_occurred_at: null,
      source: null,
      platform: null,
      app_version: null,
      surface: null,
      bookmarked: null,
    };
  }
  const lat =
    typeof body.latitude === "number"
      ? body.latitude
      : typeof body.lat === "number"
        ? body.lat
        : Number(body.latitude ?? body.lat);
  const lon =
    typeof body.longitude === "number"
      ? body.longitude
      : typeof body.lng === "number"
        ? body.lng
        : typeof body.lon === "number"
          ? body.lon
          : Number(body.longitude ?? body.lng ?? body.lon);
  const accuracyRaw =
    typeof body.accuracy_meters === "number"
      ? body.accuracy_meters
      : Number(body.accuracy_meters ?? body.accuracyMeters);
  const clientRaw = body.client_occurred_at ?? body.clientOccurredAt;
  const client_occurred_at =
    typeof clientRaw === "string" && Number.isFinite(Date.parse(clientRaw))
      ? clientRaw
      : null;
  const clip = (v: unknown, max = 64): string | null => {
    if (typeof v !== "string") return null;
    const t = v.trim();
    if (!t) return null;
    return t.slice(0, max);
  };
  return {
    latitude: Number.isFinite(lat) && lat >= -90 && lat <= 90 ? lat : null,
    longitude: Number.isFinite(lon) && lon >= -180 && lon <= 180 ? lon : null,
    accuracy_meters:
      Number.isFinite(accuracyRaw) && accuracyRaw >= 0 ? accuracyRaw : null,
    client_occurred_at,
    source: clip(body.source),
    platform: clip(body.platform),
    app_version: clip(body.app_version ?? body.appVersion, 32),
    surface: clip(body.surface, 32),
    bookmarked: typeof body.bookmarked === "boolean" ? body.bookmarked : null,
  };
}

export function isValidCheckInCoordinate(
  latitude: number | null,
  longitude: number | null,
): boolean {
  if (latitude == null || longitude == null) return false;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
  if (latitude === 0 && longitude === 0) return false;
  return latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
}

function parseMetadataInstant(
  metadata: Record<string, unknown>,
  keys: string[],
): number | null {
  for (const key of keys) {
    const raw = metadata[key];
    if (typeof raw !== "string") continue;
    const ms = Date.parse(raw);
    if (Number.isFinite(ms)) return ms;
  }
  return null;
}

export function eventScheduleBounds(metadata: Record<string, unknown>): {
  startMs: number | null;
  endMs: number | null;
} {
  const startMs = parseMetadataInstant(metadata, ["event_start_at", "eventStartAt"]);
  const endMs = parseMetadataInstant(metadata, ["event_end_at", "eventEndAt"]);
  return { startMs, endMs };
}

export function minutesBeforeStart(
  metadata: Record<string, unknown>,
  nowMs: number = Date.now(),
): number | null {
  const { startMs } = eventScheduleBounds(metadata);
  if (startMs == null) return null;
  return Math.round((startMs - nowMs) / 60_000);
}

export function minutesAfterStart(
  metadata: Record<string, unknown>,
  nowMs: number = Date.now(),
): number | null {
  const { startMs } = eventScheduleBounds(metadata);
  if (startMs == null) return null;
  return Math.round((nowMs - startMs) / 60_000);
}

/** Live for check-in: within [start - grace, end). Legacy events without schedule → allow. */
export function isEventLiveForCheckIn(
  metadata: Record<string, unknown>,
  nowMs: number = Date.now(),
): boolean {
  const { startMs, endMs } = eventScheduleBounds(metadata);
  if (startMs == null && endMs == null) return true;
  if (startMs != null && nowMs < startMs - CHECK_IN_EARLY_GRACE_MS) return false;
  if (endMs != null && nowMs >= endMs) return false;
  return true;
}

function parseBeaconLatLng(row: Record<string, unknown>): { lat: number | null; lng: number | null } {
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

export async function loadEventBeaconOrResponse(
  admin: SupabaseClient,
  beaconId: string,
): Promise<{ beacon: EventBeaconRow } | { response: NextResponse }> {
  if (!EVENT_BEACON_UUID_RE.test(beaconId)) {
    return { response: NextResponse.json({ error: "Invalid beacon id" }, { status: 400 }) };
  }

  const { data, error } = await admin
    .from("map_beacons")
    .select("id, beacon_type, expires_at, venue_id, metadata, location")
    .eq("id", beaconId)
    .maybeSingle();

  if (error) {
    console.error("loadEventBeacon:", error.message);
    return {
      response: NextResponse.json({ error: "Failed to load beacon" }, { status: 500 }),
    };
  }
  if (data == null) {
    return { response: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  }
  if (data.beacon_type !== "event") {
    return {
      response: NextResponse.json(
        { error: "Only available for event beacons" },
        { status: 400 },
      ),
    };
  }

  const expRaw = data.expires_at;
  const exp = typeof expRaw === "string" ? Date.parse(expRaw) : Number.NaN;
  if (!Number.isFinite(exp) || exp <= Date.now()) {
    return { response: NextResponse.json({ error: "Expired" }, { status: 404 }) };
  }

  const metadata = isRecord(data.metadata) ? data.metadata : {};
  const { lat, lng } = parseBeaconLatLng(data as Record<string, unknown>);

  return {
    beacon: {
      id: data.id as string,
      beacon_type: data.beacon_type as string,
      expires_at: typeof data.expires_at === "string" ? data.expires_at : null,
      venue_id: typeof data.venue_id === "string" ? data.venue_id : null,
      metadata,
      lat,
      lng,
    },
  };
}

/** Prefer geography coordinates via a small inline query when RPC missing. */
export async function resolveBeaconCoordinates(
  admin: SupabaseClient,
  beaconId: string,
  fallback: { lat: number | null; lng: number | null },
): Promise<{ lat: number | null; lng: number | null }> {
  if (fallback.lat != null && fallback.lng != null) return fallback;
  try {
    const { data, error } = await admin
      .from("map_beacons")
      .select("location")
      .eq("id", beaconId)
      .maybeSingle();
    if (error || data == null) return fallback;
    return parseBeaconLatLng(data as Record<string, unknown>);
  } catch {
    return fallback;
  }
}

export type EngagementEventInsert = {
  beacon_id: string | null;
  user_id: string | null;
  venue_id: string | null;
  event_type: EventEngagementEventType;
  occurred_at?: string;
  client_occurred_at?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  accuracy_meters?: number | null;
  distance_meters?: number | null;
  radius_meters_applied?: number | null;
  venue_scale?: string | null;
  minutes_before_start?: number | null;
  minutes_after_start?: number | null;
  had_rsvp?: boolean | null;
  had_bookmark?: boolean | null;
  reject_reason?: string | null;
  source?: string | null;
  platform?: string | null;
  app_version?: string | null;
  metadata?: Record<string, unknown>;
};

export async function insertEngagementEvent(
  admin: SupabaseClient,
  row: EngagementEventInsert,
): Promise<void> {
  const payload = {
    beacon_id: row.beacon_id,
    user_id: row.user_id,
    venue_id: row.venue_id,
    event_type: row.event_type,
    occurred_at: row.occurred_at ?? new Date().toISOString(),
    client_occurred_at: row.client_occurred_at ?? null,
    latitude: row.latitude ?? null,
    longitude: row.longitude ?? null,
    accuracy_meters: row.accuracy_meters ?? null,
    distance_meters: row.distance_meters ?? null,
    radius_meters_applied: row.radius_meters_applied ?? null,
    venue_scale: row.venue_scale ?? null,
    minutes_before_start: row.minutes_before_start ?? null,
    minutes_after_start: row.minutes_after_start ?? null,
    had_rsvp: row.had_rsvp ?? null,
    had_bookmark: row.had_bookmark ?? null,
    reject_reason: row.reject_reason ?? null,
    source: row.source ?? null,
    platform: row.platform ?? null,
    app_version: row.app_version ?? null,
    metadata: {
      ...(row.metadata ?? {}),
      ...(row.beacon_id ? { beacon_id: row.beacon_id } : {}),
    },
  };
  const { error } = await admin.from("event_engagement_events").insert(payload);
  if (error) {
    console.error("insertEngagementEvent:", error.message, row.event_type);
  }
}
