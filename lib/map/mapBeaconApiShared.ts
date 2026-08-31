import type { SupabaseClient } from "@supabase/supabase-js";
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
    event: "event",
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
  const categoryRaw = (searchParams.get("category") ?? "").trim().toLowerCase();
  if (categoryRaw.length > 0) {
    const mapped = normalizeMobileKindToBeaconType(categoryRaw);
    if (mapped != null) {
      return new Set([mapped]);
    }
  }

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

/**
 * PostGIS EWKB Point (optional SRID flag). Supabase/PostgREST often returns geography
 * as hex EWKB rather than WKT/GeoJSON — without this, callers used to fall back to (0,0)
 * and wipe real map pins.
 */
function parseEwkbPointHex(hexRaw: string): { lat: number; lng: number } | null {
  const hex = hexRaw.replace(/^\\x/i, "").trim();
  if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length < 42) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const littleEndian = view.getUint8(0) === 1;
  const typeWord = view.getUint32(1, littleEndian);
  const hasSrid = (typeWord & 0x20000000) !== 0;
  const geomType = typeWord & 0xffff;
  if (geomType !== 1) return null; // Point
  let offset = 5;
  if (hasSrid) offset += 4;
  if (offset + 16 > bytes.length) return null;
  const lng = view.getFloat64(offset, littleEndian);
  const lat = view.getFloat64(offset + 8, littleEndian);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function parseGeoJsonPoint(g: { type?: unknown; coordinates?: unknown }): { lat: number; lng: number } | null {
  if (g.type !== "Point" || !Array.isArray(g.coordinates) || g.coordinates.length < 2) {
    return null;
  }
  const lng = Number(g.coordinates[0]);
  const lat = Number(g.coordinates[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

export function parseLatLngFromLocationField(
  loc: unknown,
  fallbackLng: number,
  fallbackLat: number,
): { lat: number; lng: number } {
  if (typeof loc === "string") {
    const trimmed = loc.trim();
    const wktMatch = /(?:SRID=\d+\s*;\s*)?POINT\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*\)/i.exec(trimmed);
    if (wktMatch != null) {
      const lng = Number(wktMatch[1]);
      const lat = Number(wktMatch[2]);
      if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
    }
    if (trimmed.startsWith("{")) {
      try {
        const parsed = JSON.parse(trimmed) as { type?: unknown; coordinates?: unknown };
        const geo = parseGeoJsonPoint(parsed);
        if (geo != null) return geo;
      } catch {
        // fall through
      }
    }
    const ewkb = parseEwkbPointHex(trimmed);
    if (ewkb != null) return ewkb;
  }
  if (loc !== null && typeof loc === "object" && !Array.isArray(loc)) {
    const geo = parseGeoJsonPoint(loc as { type?: unknown; coordinates?: unknown });
    if (geo != null) return geo;
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

export function displayNameFromUserRow(user: {
  name: string | null;
  first_name: string | null;
  last_name: string | null;
}): string | null {
  const first = user.first_name?.trim() ?? "";
  const last = user.last_name?.trim() ?? "";
  const combined = [first, last].filter((s) => s.length > 0).join(" ").trim();
  if (combined.length > 0) return combined;
  const name = user.name?.trim();
  return name != null && name.length > 0 ? name : null;
}

/** Batch-load display names for user ids. Shared by proximity beacons and saved-event bookmarks. */
export async function loadUserDisplayNames(
  admin: SupabaseClient,
  userIds: string[],
): Promise<Map<string, string>> {
  const ids = [...new Set(userIds.filter((id) => id.trim().length > 0))];
  const nameById = new Map<string, string>();
  if (ids.length === 0) return nameById;

  const { data, error } = await admin
    .from("users")
    .select("id, name, first_name, last_name")
    .in("id", ids);

  if (error != null || !Array.isArray(data)) return nameById;

  for (const row of data) {
    if (row == null || typeof row !== "object" || typeof (row as { id?: unknown }).id !== "string") {
      continue;
    }
    const userRow = row as { id: string; name?: unknown; first_name?: unknown; last_name?: unknown };
    const label = displayNameFromUserRow({
      name: typeof userRow.name === "string" ? userRow.name : null,
      first_name: typeof userRow.first_name === "string" ? userRow.first_name : null,
      last_name: typeof userRow.last_name === "string" ? userRow.last_name : null,
    });
    if (label != null) nameById.set(userRow.id, label);
  }
  return nameById;
}

/** Attach `creator_name` for proximity list rows when `show_creator_name` is true. */
export async function enrichBeaconCreatorNames(
  admin: SupabaseClient,
  beacons: MapBeaconRecord[],
): Promise<MapBeaconRecord[]> {
  const flagged = beacons.filter((b) => b.show_creator_name);
  if (flagged.length === 0) return beacons;

  const nameById = await loadUserDisplayNames(
    admin,
    flagged.map((b) => b.creator_id),
  );

  return beacons.map((b) =>
    b.show_creator_name
      ? { ...b, creator_name: nameById.get(b.creator_id) ?? b.creator_name ?? null }
      : b,
  );
}
