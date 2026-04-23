import type { MapBeaconRecord, MapBeaconType } from "@/lib/map/mapBeacons";
import { MAP_BEACON_TYPES, parseMapBeacon } from "@/lib/map/mapBeacons";

const DEFAULT_RADIUS = 15_000;
const MIN_RADIUS = 100;
const MAX_RADIUS = 50_000;

/**
 * Maps mobile / BFF `kind` strings to `public.map_beacon_type` enum values.
 */
export function normalizeMobileKindToBeaconType(kindRaw: string): MapBeaconType | null {
  const v = kindRaw.trim().toLowerCase();
  const direct = MAP_BEACON_TYPES.find((t) => t === v);
  if (direct) return direct;

  const map: Record<string, MapBeaconType> = {
    soundtrack: "soundtrack",
    sos: "sos",
    study: "study",
    hazard: "hazard",
    utility: "utility",
    hazard_utility: "hazard",
    social_vibe: "recreation",
    recreation: "recreation",
    hobby: "hobby",
    swag: "swag",
    capacity: "capacity",
    transit: "transit",
    scavenger: "scavenger",
    other: "hobby",
  };
  return map[v] ?? null;
}

export function parseRadiusMeters(searchParams: URLSearchParams): number {
  const radiusRaw =
    searchParams.get("radius_meters") ??
    searchParams.get("radius_m") ??
    searchParams.get("radius") ??
    "";
  const radius_m =
    radiusRaw.length > 0 ? Number(radiusRaw) : DEFAULT_RADIUS;
  return Math.min(MAX_RADIUS, Math.max(MIN_RADIUS, Number.isFinite(radius_m) ? radius_m : DEFAULT_RADIUS));
}

export function parseLatLon(searchParams: URLSearchParams): { lat: number; lng: number } | null {
  const lat = Number(searchParams.get("lat"));
  const lng = Number(searchParams.get("lng") ?? searchParams.get("lon"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

/**
 * Normalizes `fetch_map_beacons_within` RPC payloads from Supabase/PostgREST.
 * Some clients return a JSON array; others may stringify JSON or wrap rows.
 */
export function normalizeBeaconRpcRows(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  if (typeof data === "string") {
    const t = data.trim();
    if (t.length === 0 || t === "null") return [];
    try {
      return normalizeBeaconRpcRows(JSON.parse(t) as unknown);
    } catch {
      return [];
    }
  }
  if (data !== null && typeof data === "object") {
    const rec = data as Record<string, unknown>;
    const nested = rec.beacons ?? rec.data ?? rec.rows ?? rec.items;
    if (Array.isArray(nested)) return nested;
  }
  return [];
}

export function parseBeaconTypeFilters(searchParams: URLSearchParams): Set<MapBeaconType> | null {
  const raw = (searchParams.get("filters") ?? searchParams.get("beacon_types") ?? "").trim();
  if (raw.length === 0) return null;
  const parts = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);
  const allowed = new Set<MapBeaconType>();
  for (const p of parts) {
    if (MAP_BEACON_TYPES.includes(p as MapBeaconType)) {
      allowed.add(p as MapBeaconType);
    }
  }
  return allowed.size > 0 ? allowed : null;
}

export function filterBeaconRecords(
  rows: MapBeaconRecord[],
  allowed: Set<MapBeaconType> | null,
): MapBeaconRecord[] {
  if (allowed == null) return rows;
  return rows.filter((b) => allowed.has(b.beacon_type));
}

function parseLatLngFromLocationField(loc: unknown, fallbackLng: number, fallbackLat: number): { lat: number; lng: number } {
  if (typeof loc === "string") {
    const wktMatch = /POINT\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*\)/i.exec(loc);
    if (wktMatch != null) {
      return { lng: Number(wktMatch[1]), lat: Number(wktMatch[2]) };
    }
  }
  if (loc !== null && typeof loc === "object" && !Array.isArray(loc)) {
    const g = loc as { type?: unknown; coordinates?: unknown };
    if (g.type === "Point" && Array.isArray(g.coordinates) && g.coordinates.length >= 2) {
      const lng = Number(g.coordinates[0]);
      const lat = Number(g.coordinates[1]);
      if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
    }
  }
  return { lat: fallbackLat, lng: fallbackLng };
}

/** Adds `lat` / `lng` for `parseMapBeacon` from PostGIS `location` (WKT or GeoJSON) on a `map_beacons` row. */
export function rowFromInsertWithLocation(inserted: unknown, fallbackLng: number, fallbackLat: number): unknown {
  if (inserted == null || typeof inserted !== "object" || Array.isArray(inserted)) {
    return inserted;
  }
  const rec = inserted as Record<string, unknown>;
  const parsed = parseLatLngFromLocationField(rec.location, fallbackLng, fallbackLat);
  return {
    ...rec,
    lat: parsed.lat,
    lng: parsed.lng,
  };
}

export function parseInsertedBeacon(
  inserted: unknown,
  fallbackLng: number,
  fallbackLat: number,
): MapBeaconRecord | null {
  return parseMapBeacon(rowFromInsertWithLocation(inserted, fallbackLng, fallbackLat));
}
