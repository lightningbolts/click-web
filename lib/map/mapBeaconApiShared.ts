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
    hazard: "hazard_utility",
    hazard_utility: "hazard_utility",
    utility: "hazard_utility",
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

export function rowFromInsertWithLocation(inserted: unknown, fallbackLng: number, fallbackLat: number): unknown {
  if (inserted == null || typeof inserted !== "object" || Array.isArray(inserted)) {
    return inserted;
  }
  const rec = inserted as Record<string, unknown>;
  const loc = rec.location;
  const wktMatch = typeof loc === "string" ? /POINT\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*\)/i.exec(loc) : null;
  const parsed =
    wktMatch != null
      ? { lng: Number(wktMatch[1]), lat: Number(wktMatch[2]) }
      : { lng: fallbackLng, lat: fallbackLat };
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
