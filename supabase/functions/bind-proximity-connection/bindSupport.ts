/**
 * Shared helpers for the bind-proximity-connection Edge Function.
 *
 * Split out of index.ts verbatim for readability; index.ts keeps the
 * Deno.serve handler. This file is mirrored between click-web (source of
 * truth) and click — keep both copies identical (scripts/check-supabase-drift.sh).
 */

export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export const GHOST_TTL_MS = 5 * 60 * 1000;
export const CLEANUP_GRACE_MS = 6 * 60 * 1000;
export const MATCH_TIME_WINDOW_MS = GHOST_TTL_MS;
export const RECENT_CONNECTION_LOCK_MS = 15 * 1000;
export const PROXIMITY_MATCH_MAX_M = 15;
export const ENCOUNTER_DEBOUNCE_MAX_M = 50;
export const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;
export const EXTENDED_HANGOUT_TAG = 'Extended Hangout';
export const NOMINATIM_REVERSE_TIMEOUT_MS = 3_500;
export const OPEN_METEO_TIMEOUT_MS = 3_500;
export const NOMINATIM_USER_AGENT = 'ClickPlatformsApp/1.0 (contact@click.com)';
export const DISPLAY_LOCATION_FALLBACK = 'A new city';

export type UserProfile = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  created_at: number;
  connection_id: string | null;
  encounter_logged: boolean;
  /** False when this bind attached to an existing `connections` row (reconnection / same pair). */
  is_new_connection: boolean;
  /** True when a new `connection_encounters` row was inserted or debounced on the server during this bind. */
  encounter_persisted_on_bind: boolean;
  reason?: string;
};

export type EncounterMutationOutcome =
  | 'inserted'
  | 'debounced'
  | 'rate_limited'
  | 'insert_error'
  | 'debounce_update_error';

/** 10:00 AM local on the day after bump (offset minutes east of UTC). */
export function computeCollaborationTtl(offsetMinutes: number, nowUtcMs: number = Date.now()): string {
  const safeOffset = Number.isFinite(offsetMinutes) ? Math.trunc(offsetMinutes) : 0;
  const localNowMs = nowUtcMs + safeOffset * 60_000;
  const localNow = new Date(localNowMs);
  const y = localNow.getUTCFullYear();
  const mo = localNow.getUTCMonth();
  const day = localNow.getUTCDate();
  const targetLocalAsUtc = Date.UTC(y, mo, day + 1, 10, 0, 0, 0);
  const targetUtcMs = targetLocalAsUtc - safeOffset * 60_000;
  return new Date(targetUtcMs).toISOString();
}

export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function normalizeToken(t: unknown): string | null {
  if (typeof t !== 'string') return null;
  const d = t.replace(/\D/g, '').slice(-4).padStart(4, '0');
  return d.length === 4 ? d : null;
}

export function tokenSetsIntersect(a: string[], b: string[]): boolean {
  const sa = new Set(a);
  for (const x of b) {
    if (sa.has(x)) return true;
  }
  return false;
}

export type HandshakeRowLite = {
  id: string;
  user_id: string;
  my_token: unknown;
  heard_tokens: unknown;
  lat: unknown;
  lon: unknown;
  created_at: string;
};

export function parseHeardTokensField(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeToken).filter((t): t is string => t != null);
}

export function rowMyTokenNorm(row: HandshakeRowLite): string | null {
  return normalizeToken(row.my_token);
}

export function rowTimeMs(row: HandshakeRowLite): number {
  const t = Date.parse(String(row.created_at));
  return Number.isFinite(t) ? t : 0;
}

/** Same distance rule as legacy pairwise match: skip check if either side lacks usable GPS. */
export function gpsPairWithinProximityMax(
  la: number | null,
  lo: number | null,
  lb: number | null,
  mb: number | null,
): boolean {
  if (la == null || lo == null || lb == null || mb == null) return true;
  if (la === 0 && lo === 0) return true;
  if (lb === 0 && mb === 0) return true;
  return haversineMeters(la, lo, lb, mb) <= PROXIMITY_MATCH_MAX_M;
}

export function tokenEvidenceBetweenRows(a: HandshakeRowLite, b: HandshakeRowLite): boolean {
  const ta = rowMyTokenNorm(a);
  const tb = rowMyTokenNorm(b);
  if (!ta || !tb) return false;
  const heardA = parseHeardTokensField(a.heard_tokens);
  const heardB = parseHeardTokensField(b.heard_tokens);
  const mutual = heardA.includes(tb) && heardB.includes(ta);
  if (mutual) return true;
  return tokenSetsIntersect(heardA, heardB);
}

export function handshakeRowsLinked(a: HandshakeRowLite, b: HandshakeRowLite): boolean {
  const dt = Math.abs(rowTimeMs(a) - rowTimeMs(b));
  if (dt > MATCH_TIME_WINDOW_MS) return false;
  if (!tokenEvidenceBetweenRows(a, b)) return false;
  const la = finiteNumber(a.lat);
  const lo = finiteNumber(a.lon);
  const lb = finiteNumber(b.lat);
  const mb = finiteNumber(b.lon);
  return gpsPairWithinProximityMax(la, lo, lb, mb);
}

/** Latest row per user_id (most recent `created_at`) for stable graph nodes. */
export function latestHandshakeRowPerUser(rows: HandshakeRowLite[]): Map<string, HandshakeRowLite> {
  const m = new Map<string, HandshakeRowLite>();
  for (const r of rows) {
    if (!r?.user_id) continue;
    const uid = String(r.user_id);
    const prev = m.get(uid);
    if (!prev || rowTimeMs(r) >= rowTimeMs(prev)) {
      m.set(uid, r);
    }
  }
  return m;
}

export function buildUserAdjacency(nodes: HandshakeRowLite[]): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>();
  const addEdge = (u: string, v: string) => {
    if (u === v) return;
    if (!adj.has(u)) adj.set(u, new Set());
    if (!adj.has(v)) adj.set(v, new Set());
    adj.get(u)!.add(v);
    adj.get(v)!.add(u);
  };
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i];
      const b = nodes[j];
      if (!a || !b) continue;
      if (handshakeRowsLinked(a, b)) {
        addEdge(String(a.user_id), String(b.user_id));
      }
    }
  }
  return adj;
}

export function bfsComponent(startUserId: string, adj: Map<string, Set<string>>): Set<string> {
  const out = new Set<string>();
  const q: string[] = [];
  if (!adj.has(startUserId)) return out;
  out.add(startUserId);
  q.push(startUserId);
  while (q.length) {
    const u = q.pop()!;
    for (const v of adj.get(u) ?? []) {
      if (!out.has(v)) {
        out.add(v);
        q.push(v);
      }
    }
  }
  return out;
}

export function twelveHourUtcBlockId(iso: string): number | null {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  return Math.floor(ms / TWELVE_HOURS_MS);
}

export function finiteNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

export function finiteBatteryPct(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  const r = Math.round(v);
  if (r < 0 || r > 100) return null;
  return r;
}

export function utcTimeOfDayLabelFromMs(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} UTC`;
}

export function isDuplicateKeyError(err: { message?: string; code?: string } | null): boolean {
  const code = err?.code ?? '';
  const msg = (err?.message ?? '').toLowerCase();
  return code === '23505' || msg.includes('duplicate key') || msg.includes('unique constraint');
}

export function isEncounterRateLimitError(err: { message?: string; details?: string; hint?: string } | null): boolean {
  if (!err) return false;
  const combined = [
    err.message ?? '',
    err.details ?? '',
    err.hint ?? '',
  ].join(' ');
  return combined.includes('encounter_rate_limit_3h');
}

/** Client `context_tags`: trimmed non-empty strings, order preserved, deduped. */
export function normalizeContextTagsArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const x of raw) {
    if (typeof x !== 'string') continue;
    const t = x.trim();
    if (t.length === 0) continue;
    if (!out.includes(t)) out.push(t);
  }
  return out;
}

export function mergeContextTagLists(client: string[], derived: string[]): string[] {
  const out: string[] = [];
  const add = (t: string) => {
    if (!out.includes(t)) out.push(t);
  };
  for (const t of client) add(t);
  for (const t of derived) add(t);
  return out;
}

export function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

export function firstNonEmptyString(values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

export function extractDisplayLocation(semanticLocation: Record<string, unknown>): string {
  const address = isRecord(semanticLocation.address) ? semanticLocation.address : null;
  if (!address) return DISPLAY_LOCATION_FALLBACK;
  const city = firstNonEmptyString([
    address.city,
    address.town,
    address.village,
    address.hamlet,
  ]);
  if (!city) return DISPLAY_LOCATION_FALLBACK;
  const state = firstNonEmptyString([address.state]);
  return state ? `${city}, ${state}` : city;
}

export function extractSpecificLocationName(semanticLocation: Record<string, unknown>): string | null {
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

export function openMeteoCodeToLabel(code: number): string {
  if (code === 0) return 'Clear';
  if ([1, 2, 3].includes(code)) return 'Cloudy';
  if ([45, 48].includes(code)) return 'Foggy';
  if ([51, 53, 55, 56, 57].includes(code)) return 'Drizzle';
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return 'Rain';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'Snow';
  if ([95, 96, 99].includes(code)) return 'Storm';
  return 'Clear';
}

export function openMeteoCodeToIcon(code: number): string {
  if (code === 0) return 'clear';
  if ([1, 2, 3].includes(code)) return 'cloudy';
  if ([45, 48].includes(code)) return 'fog';
  if ([51, 53, 55, 56, 57].includes(code)) return 'drizzle';
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return 'rain';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'snow';
  if ([95, 96, 99].includes(code)) return 'thunder';
  return 'clear';
}

export type OpenMeteoForecast = {
  weatherSnapshot: string | null;
  elevationM: number | null;
};

/**
 * One Open-Meteo forecast request: current weather plus DEM terrain AMSL (`elevation`).
 */
export async function fetchOpenMeteoForecast(lat: number, lon: number): Promise<OpenMeteoForecast> {
  const empty: OpenMeteoForecast = { weatherSnapshot: null, elevationM: null };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OPEN_METEO_TIMEOUT_MS);
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      '&current=temperature_2m,weather_code,wind_speed_10m,wind_direction_10m,pressure_msl';
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return empty;
    const raw = (await res.json()) as {
      elevation?: unknown;
      current?: {
        temperature_2m?: number;
        weather_code?: number;
        wind_speed_10m?: number;
        wind_direction_10m?: number;
        pressure_msl?: number;
      };
    };
    const elevationM =
      typeof raw.elevation === 'number' && Number.isFinite(raw.elevation) ? raw.elevation : null;
    const cur = raw.current;
    if (cur == null || typeof cur.temperature_2m !== 'number' || !Number.isFinite(cur.temperature_2m)) {
      return { weatherSnapshot: null, elevationM };
    }
    const code =
      typeof cur.weather_code === 'number' && Number.isFinite(cur.weather_code) ? cur.weather_code : 0;
    const payload = {
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
    };
    return { weatherSnapshot: JSON.stringify(payload), elevationM };
  } catch {
    return empty;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchOpenMeteoWeatherSnapshot(lat: number, lon: number): Promise<string | null> {
  return (await fetchOpenMeteoForecast(lat, lon)).weatherSnapshot;
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
      headers: {
        Accept: 'application/json',
        'User-Agent': NOMINATIM_USER_AGENT,
      },
    });
    if (!response.ok) {
      return {
        semanticLocation: null,
        displayLocation: DISPLAY_LOCATION_FALLBACK,
        specificLocationName: null,
      };
    }
    const payload = (await response.json()) as unknown;
    if (!isRecord(payload)) {
      return {
        semanticLocation: null,
        displayLocation: DISPLAY_LOCATION_FALLBACK,
        specificLocationName: null,
      };
    }
    return {
      semanticLocation: payload,
      displayLocation: extractDisplayLocation(payload),
      specificLocationName: extractSpecificLocationName(payload),
    };
  } catch {
    return {
      semanticLocation: null,
      displayLocation: DISPLAY_LOCATION_FALLBACK,
      specificLocationName: null,
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Variance of |a| over ~500ms; same units from Android + normalized iOS clients. */
export const MOTION_VARIANCE_ACTIVE_THRESHOLD = 1.25;

export function buildVibeContextTags(input: {
  lux: number | null;
  selfMotion: number | null;
  peerMotion: number | null;
  selfAz: number | null;
  peerAz: number | null;
  battery: number | null;
}): string[] {
  const tags: string[] = [];
  const add = (t: string) => {
    if (!tags.includes(t)) tags.push(t);
  };
  const { lux, selfMotion, peerMotion, selfAz, peerAz, battery } = input;
  if (lux != null) {
    if (lux < 15) add('Dimly Lit');
    if (lux > 10_000) add('Bright Outdoors');
  }
  if (selfAz != null && peerAz != null) {
    const raw = Math.abs(selfAz - peerAz);
    const diff = Math.min(raw, 360 - raw);
    if (diff >= 160 && diff <= 200) add('Met Face-to-Face');
  }
  if (battery != null && battery <= 5) add('Living on the Edge (Low Battery)');
  if (
    selfMotion != null &&
    peerMotion != null &&
    selfMotion > MOTION_VARIANCE_ACTIVE_THRESHOLD &&
    peerMotion > MOTION_VARIANCE_ACTIVE_THRESHOLD
  ) {
    add('Active/Moving');
  }
  return tags;
}

/**
 * Classifies height above local ground (AGL). Pass `relative_altitude_m`
 * (barometric AMSL − DEM terrain), never raw AMSL.
 * Thresholds mirror KMP `deriveHeightCategory` / click-web `deriveHeightCategoryFromRelativeAltitudeM`.
 */
export function deriveHeightCategoryFromRelativeAltitudeM(
  relativeAltitudeM: number | null | undefined,
): string | null {
  if (relativeAltitudeM == null || !Number.isFinite(relativeAltitudeM)) return null;
  if (relativeAltitudeM < -3.0) return 'BELOW_GROUND';
  if (relativeAltitudeM < 8.0) return 'GROUND_LEVEL';
  if (relativeAltitudeM < 35.0) return 'ELEVATED';
  return 'HIGH_RISE';
}

/**
 * Terrain elevation (m above sea level) from Open-Meteo forecast DEM (`elevation`).
 */
export async function fetchTerrainElevationM(lat: number, lon: number): Promise<number | null> {
  return (await fetchOpenMeteoForecast(lat, lon)).elevationM;
}
