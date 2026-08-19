import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchTerrainElevationMeters } from '@/lib/server/terrainElevation';
import { normalizeContextTagsArray } from '@/lib/server/connectionEncounterContextTag';
import {
  finiteNumber,
  normalizeToken,
  pendingCandidateBBox,
  PENDING_CANDIDATE_BBOX_RADIUS_M,
  PENDING_CANDIDATE_MAX_ROWS,
  type HandshakeRowLite,
} from '@/lib/server/proximity/matching';
import type {
  PendingHandshakeRow,
  ProximityBindOkResponse,
  ProximityBindIgnoredResponse,
  ProximityBindPendingResponse,
  ProximityHandshakeRequest,
  ProximitySensorPayloadJson,
} from '@/types/supabase-json';

export const DISPLAY_LOCATION_FALLBACK = 'A new city';
const NOMINATIM_REVERSE_TIMEOUT_MS = 3_500;
const OPEN_METEO_TIMEOUT_MS = 3_500;
const OPEN_ELEVATION_BIND_TIMEOUT_MS = 2_500;
const NOMINATIM_USER_AGENT = 'ClickPlatformsApp/1.0 (contact@click.com)';

export const PENDING_HANDSHAKE_SELECT =
  'id, user_id, my_token, heard_tokens, lat, lon, lux_level, motion_variance, compass_azimuth, battery_level, sensor_payload, created_at, expires_at, matched_at';
export const USER_PROFILE_SELECT = 'id, name, email, image, created_at:createdAt';

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Load unmatched pending rows near the caller (token overlap and/or GPS bbox).
 * Never scans the full unmatched table — required for global scale.
 */
export async function fetchScopedPendingCandidates(
  admin: SupabaseClient,
  opts: {
    nowIso: string;
    callerUserId: string;
    evidenceTokens: string[];
    lat: number | null;
    lon: number | null;
  },
): Promise<{ rows: PendingHandshakeRow[]; error: string | null }> {
  const { nowIso, callerUserId, evidenceTokens, lat, lon } = opts;
  const byId = new Map<string, PendingHandshakeRow>();

  const mergeRows = (data: unknown) => {
    for (const raw of Array.isArray(data) ? data : []) {
      if (!raw || typeof raw !== 'object') continue;
      const row = raw as PendingHandshakeRow;
      if (!row.id) continue;
      byId.set(String(row.id), row);
    }
  };

  // Always include caller's unmatched rows.
  const { data: selfRows, error: selfErr } = await admin
    .from('pending_handshakes')
    .select(PENDING_HANDSHAKE_SELECT)
    .eq('user_id', callerUserId)
    .gt('expires_at', nowIso)
    .is('matched_at', null)
    .limit(PENDING_CANDIDATE_MAX_ROWS);
  if (selfErr) {
    return { rows: [], error: selfErr.message };
  }
  mergeRows(selfRows);

  const tokens = [...new Set(evidenceTokens.map((t) => normalizeToken(t)).filter((t): t is string => t != null))];
  if (tokens.length > 0) {
    const tokenList = tokens.slice(0, 32).join(',');
    const { data: tokenRows, error: tokenErr } = await admin
      .from('pending_handshakes')
      .select(PENDING_HANDSHAKE_SELECT)
      .gt('expires_at', nowIso)
      .is('matched_at', null)
      .in('my_token', tokens.slice(0, 32))
      .limit(PENDING_CANDIDATE_MAX_ROWS);
    if (tokenErr) {
      // Fallback: PostgREST `or` for heard_tokens overlap when .in fails shape
      console.warn('[proximity] token candidate query:', tokenErr.message);
      const { data: orRows, error: orErr } = await admin
        .from('pending_handshakes')
        .select(PENDING_HANDSHAKE_SELECT)
        .gt('expires_at', nowIso)
        .is('matched_at', null)
        .or(`my_token.in.(${tokenList})`)
        .limit(PENDING_CANDIDATE_MAX_ROWS);
      if (orErr) {
        return { rows: [], error: orErr.message };
      }
      mergeRows(orRows);
    } else {
      mergeRows(tokenRows);
    }
  }

  if (lat != null && lon != null && !(lat === 0 && lon === 0)) {
    const box = pendingCandidateBBox(lat, lon, PENDING_CANDIDATE_BBOX_RADIUS_M);
    const { data: geoRows, error: geoErr } = await admin
      .from('pending_handshakes')
      .select(PENDING_HANDSHAKE_SELECT)
      .gt('expires_at', nowIso)
      .is('matched_at', null)
      .gte('lat', box.minLat)
      .lte('lat', box.maxLat)
      .gte('lon', box.minLon)
      .lte('lon', box.maxLon)
      .limit(PENDING_CANDIDATE_MAX_ROWS);
    if (geoErr) {
      console.warn('[proximity] geo candidate query:', geoErr.message);
    } else {
      mergeRows(geoRows);
    }
  }

  const rows = [...byId.values()].slice(0, PENDING_CANDIDATE_MAX_ROWS);
  return { rows, error: null };
}

export type BindResult =
  | { kind: 'ok'; status: 200; body: ProximityBindOkResponse }
  | { kind: 'pending'; status: 202; body: ProximityBindPendingResponse }
  | { kind: 'ignored'; status: 200; body: ProximityBindIgnoredResponse }
  | {
      kind: 'error';
      status: number;
      body: {
        error: string;
        pending_handshake_id?: string;
        expires_at?: string;
        pair?: string[];
      };
    };

export type EncounterMutationOutcome =
  | 'inserted'
  | 'debounced'
  | 'rate_limited'
  | 'insert_error'
  | 'debounce_update_error';

export function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function firstNonEmptyString(values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

function extractDisplayLocation(semanticLocation: Record<string, unknown>): string {
  const address = isRecord(semanticLocation.address) ? semanticLocation.address : null;
  if (!address) return DISPLAY_LOCATION_FALLBACK;
  const city = firstNonEmptyString([address.city, address.town, address.village, address.hamlet]);
  if (!city) return DISPLAY_LOCATION_FALLBACK;
  const state = firstNonEmptyString([address.state]);
  return state ? `${city}, ${state}` : city;
}

// Intentionally diverges from lib/server/connections/geo.ts's extractSpecificLocationName
// (this variant composes `house_number + road` and does not prefer the top-level `name`).
function extractSpecificLocationName(semanticLocation: Record<string, unknown>): string | null {
  const address = isRecord(semanticLocation.address) ? semanticLocation.address : null;
  if (address) {
    const hn = firstNonEmptyString([address.house_number]);
    const rd = firstNonEmptyString([address.road]);
    if (hn != null && rd != null) return `${hn} ${rd}`;
  }
  return firstNonEmptyString([
    semanticLocation.name,
    address?.amenity,
    address?.building,
    address?.residential,
    address?.road,
  ]);
}

function openMeteoCodeToLabel(code: number): string {
  if (code === 0) return 'Clear';
  if ([1, 2, 3].includes(code)) return 'Cloudy';
  if ([45, 48].includes(code)) return 'Foggy';
  if ([51, 53, 55, 56, 57].includes(code)) return 'Drizzle';
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return 'Rain';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'Snow';
  if ([95, 96, 99].includes(code)) return 'Storm';
  return 'Clear';
}

function openMeteoCodeToIcon(code: number): string {
  if (code === 0) return 'clear';
  if ([1, 2, 3].includes(code)) return 'cloudy';
  if ([45, 48].includes(code)) return 'fog';
  if ([51, 53, 55, 56, 57].includes(code)) return 'drizzle';
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return 'rain';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'snow';
  if ([95, 96, 99].includes(code)) return 'thunder';
  return 'clear';
}

export async function fetchOpenMeteoWeatherSnapshot(lat: number, lon: number): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OPEN_METEO_TIMEOUT_MS);
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      '&current=temperature_2m,weather_code,wind_speed_10m,wind_direction_10m,pressure_msl';
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    const raw = (await res.json()) as {
      current?: {
        temperature_2m?: number;
        weather_code?: number;
        wind_speed_10m?: number;
        wind_direction_10m?: number;
        pressure_msl?: number;
      };
    };
    const cur = raw.current;
    if (cur == null || typeof cur.temperature_2m !== 'number' || !Number.isFinite(cur.temperature_2m)) {
      return null;
    }
    const code =
      typeof cur.weather_code === 'number' && Number.isFinite(cur.weather_code) ? cur.weather_code : 0;
    return JSON.stringify({
      iconCode: openMeteoCodeToIcon(code),
      condition: openMeteoCodeToLabel(code),
      windSpeedKph:
        typeof cur.wind_speed_10m === 'number' && Number.isFinite(cur.wind_speed_10m)
          ? cur.wind_speed_10m
          : null,
      pressureMslHpa:
        typeof cur.pressure_msl === 'number' && Number.isFinite(cur.pressure_msl) ? cur.pressure_msl : null,
      temperatureCelsius: cur.temperature_2m,
      windDirectionDegrees:
        typeof cur.wind_direction_10m === 'number' && Number.isFinite(cur.wind_direction_10m)
          ? Math.round(cur.wind_direction_10m)
          : null,
    });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchNominatimReverseGeocode(lat: number, lon: number): Promise<{
  semanticLocation: Record<string, unknown> | null;
  displayLocation: string;
  specificLocationName: string | null;
}> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NOMINATIM_REVERSE_TIMEOUT_MS);
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`;
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json', 'User-Agent': NOMINATIM_USER_AGENT },
    });
    if (!response.ok) {
      return { semanticLocation: null, displayLocation: DISPLAY_LOCATION_FALLBACK, specificLocationName: null };
    }
    const payload = (await response.json()) as unknown;
    if (!isRecord(payload)) {
      return { semanticLocation: null, displayLocation: DISPLAY_LOCATION_FALLBACK, specificLocationName: null };
    }
    return {
      semanticLocation: payload,
      displayLocation: extractDisplayLocation(payload),
      specificLocationName: extractSpecificLocationName(payload),
    };
  } catch {
    return { semanticLocation: null, displayLocation: DISPLAY_LOCATION_FALLBACK, specificLocationName: null };
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchTerrainElevationM(lat: number, lon: number): Promise<number | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OPEN_ELEVATION_BIND_TIMEOUT_MS);
  try {
    return await fetchTerrainElevationMeters(lat, lon);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function pendingRowToHandshakeLite(row: PendingHandshakeRow): HandshakeRowLite {
  return {
    id: row.id,
    user_id: row.user_id,
    my_token: row.my_token,
    heard_tokens: row.heard_tokens,
    lat: row.lat,
    lon: row.lon,
    created_at: row.created_at,
    lux_level: row.lux_level,
    motion_variance: row.motion_variance,
    compass_azimuth: row.compass_azimuth,
    battery_level: row.battery_level,
    sensor_payload: row.sensor_payload,
  };
}

export function sensorPayloadFromRow(row: HandshakeRowLite | null | undefined): ProximitySensorPayloadJson {
  return isRecord(row?.sensor_payload) ? (row.sensor_payload as ProximitySensorPayloadJson) : {};
}

export function nonEmptyPayloadString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

export function buildSensorPayload(body: ProximityHandshakeRequest, timezoneOffsetMinutes: number): ProximitySensorPayloadJson {
  const exactBarometricElevationM = finiteNumber(body.exact_barometric_elevation_m);
  const exactNoiseLevelDb = finiteNumber(body.exact_noise_level_db);
  const noiseLevel =
    typeof body.noise_level === 'string' && body.noise_level.trim().length > 0
      ? body.noise_level.trim()
      : null;
  const clientHeightCategory =
    typeof body.height_category === 'string' && body.height_category.trim().length > 0
      ? body.height_category.trim()
      : null;
  const manualLocationName =
    typeof body.location_name === 'string' && body.location_name.trim().length > 0
      ? body.location_name.trim()
      : null;
  const clientWeatherSnapshot =
    typeof body.weather_snapshot === 'string' && body.weather_snapshot.trim().length > 0
      ? body.weather_snapshot.trim()
      : null;

  return {
    exact_barometric_elevation_m: exactBarometricElevationM,
    noise_level: noiseLevel,
    exact_noise_level_db: exactNoiseLevelDb,
    context_tags: normalizeContextTagsArray(body.context_tags),
    height_category: clientHeightCategory,
    location_name: manualLocationName,
    weather_snapshot: clientWeatherSnapshot,
    timezone_offset_minutes: timezoneOffsetMinutes,
  };
}

export async function markPendingHandshakesMatched(
  admin: SupabaseClient,
  memberUserIds: string[],
  matchedAtIso: string,
): Promise<void> {
  if (memberUserIds.length === 0) return;
  const { error } = await admin
    .from('pending_handshakes')
    .update({ matched_at: matchedAtIso })
    .in('user_id', memberUserIds)
    .is('matched_at', null);
  if (error) {
    console.warn('[proximity] mark matched:', error.message);
  }
}

/**
 * Immutable per-bind state shared by the encounter-persistence helpers, plus the
 * mutable per-bind template cache. Assembled once in bindProximityHandshake after
 * `memberIds` is known; the same object (including the mutable Map) is threaded
 * through so behavior matches the original closure-based implementation exactly.
 */
export type BindContext = {
  admin: SupabaseClient;
  uid: string;
  insertedRow: PendingHandshakeRow;
  latestByUser: Map<string, HandshakeRowLite>;
  memberIds: string[];
  encLat: number | null;
  encLon: number | null;
  selfLux: number | null;
  selfMotion: number | null;
  selfAz: number | null;
  selfBattery: number | null;
  exactNoiseLevelDb: number | null;
  noiseLevel: string | null;
  exactBarometricElevationM: number | null;
  clientHeightCategory: string | null;
  manualLocationName: string | null;
  clientWeatherSnapshot: string | null;
  clientContextTags: string[];
  encounterMemberTemplateCache: Map<
    string,
    { row: Record<string, unknown>; lat: number | null; lon: number | null }
  >;
};
