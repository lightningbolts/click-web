/**
 * Edge Function: bind-proximity-connection
 *
 * POST JSON { my_token, heard_tokens[], latitude?, longitude?, gps_lat?, gps_lon?,
 *   exact_barometric_elevation_m?, noise_level?, exact_noise_level_db?, context_tags?, height_category?,
 *   lux_level?, motion_variance?, compass_azimuth?, battery_level?, client_context_first? (ignored) }
 * Authorization: Bearer <user JWT>
 *
 * Inserts this device's handshake, then returns other users whose pings overlap in time,
 * distance (≤15m when both have GPS), and token evidence (mutual hear or heard_tokens intersect).
 *
 * Ghost taps: unmatched handshake rows are kept up to ~5 minutes so a delayed peer ping can match.
 * Encounter debouncing: new crossings within 50m and the same 12-hour UTC block append "Extended Hangout"
 * to the latest encounter instead of inserting a duplicate row.
 *
 * On each successful match: ensures a `connections` row exists (creates one + `chats` when missing), inserts
 * or debounces `connection_encounters` with sensor payload, and returns per-peer `is_new_connection` plus
 * optional top-level `connection_id` / `is_new_connection` when exactly one peer matched.
 *
 * Multi-tap: builds a token/GPS/time graph across all handshake rows in the window so a third participant
 * can match transitively. When three or more users are in the same component, `group_clique_candidate` is set
 * for clients to start a verified group flow. Pairwise `connections` inserts are skipped when a row
 * already exists (unique-safe); encounters are still logged for reunions.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GHOST_TTL_MS = 5 * 60 * 1000;
const CLEANUP_GRACE_MS = 6 * 60 * 1000;
const MATCH_TIME_WINDOW_MS = GHOST_TTL_MS;
const PROXIMITY_MATCH_MAX_M = 15;
const ENCOUNTER_DEBOUNCE_MAX_M = 50;
const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;
const EXTENDED_HANGOUT_TAG = 'Extended Hangout';
const NOMINATIM_REVERSE_TIMEOUT_MS = 3_500;
const OPEN_METEO_TIMEOUT_MS = 3_500;
/** Open-Elevation lookup budget during bind; keep small so tri-factor resolution stays snappy. */
const OPEN_ELEVATION_BIND_TIMEOUT_MS = 2_500;
const NOMINATIM_USER_AGENT = 'ClickPlatformsApp/1.0 (contact@click.com)';
const DISPLAY_LOCATION_FALLBACK = 'A new city';

type UserProfile = {
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

type EncounterMutationOutcome =
  | 'inserted'
  | 'debounced'
  | 'rate_limited'
  | 'insert_error'
  | 'debounce_update_error';

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
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

function normalizeToken(t: unknown): string | null {
  if (typeof t !== 'string') return null;
  const d = t.replace(/\D/g, '').slice(-4).padStart(4, '0');
  return d.length === 4 ? d : null;
}

function tokenSetsIntersect(a: string[], b: string[]): boolean {
  const sa = new Set(a);
  for (const x of b) {
    if (sa.has(x)) return true;
  }
  return false;
}

type HandshakeRowLite = {
  id: string;
  user_id: string;
  my_token: unknown;
  heard_tokens: unknown;
  lat: unknown;
  lon: unknown;
  created_at: string;
};

function parseHeardTokensField(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeToken).filter((t): t is string => t != null);
}

function rowMyTokenNorm(row: HandshakeRowLite): string | null {
  return normalizeToken(row.my_token);
}

function rowTimeMs(row: HandshakeRowLite): number {
  const t = Date.parse(String(row.created_at));
  return Number.isFinite(t) ? t : 0;
}

/** Same distance rule as legacy pairwise match: skip check if either side lacks usable GPS. */
function gpsPairWithinProximityMax(
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

function tokenEvidenceBetweenRows(a: HandshakeRowLite, b: HandshakeRowLite): boolean {
  const ta = rowMyTokenNorm(a);
  const tb = rowMyTokenNorm(b);
  if (!ta || !tb) return false;
  const heardA = parseHeardTokensField(a.heard_tokens);
  const heardB = parseHeardTokensField(b.heard_tokens);
  const mutual = heardA.includes(tb) && heardB.includes(ta);
  if (mutual) return true;
  return tokenSetsIntersect(heardA, heardB);
}

function handshakeRowsLinked(a: HandshakeRowLite, b: HandshakeRowLite): boolean {
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
function latestHandshakeRowPerUser(rows: HandshakeRowLite[]): Map<string, HandshakeRowLite> {
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

function buildUserAdjacency(nodes: HandshakeRowLite[]): Map<string, Set<string>> {
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

function bfsComponent(startUserId: string, adj: Map<string, Set<string>>): Set<string> {
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

function twelveHourUtcBlockId(iso: string): number | null {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  return Math.floor(ms / TWELVE_HOURS_MS);
}

function finiteNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function finiteBatteryPct(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  const r = Math.round(v);
  if (r < 0 || r > 100) return null;
  return r;
}

function utcTimeOfDayLabelFromMs(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} UTC`;
}

function isDuplicateKeyError(err: { message?: string; code?: string } | null): boolean {
  const code = err?.code ?? '';
  const msg = (err?.message ?? '').toLowerCase();
  return code === '23505' || msg.includes('duplicate key') || msg.includes('unique constraint');
}

/** Client `context_tags`: trimmed non-empty strings, order preserved, deduped. */
function normalizeContextTagsArray(raw: unknown): string[] {
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

function mergeContextTagLists(client: string[], derived: string[]): string[] {
  const out: string[] = [];
  const add = (t: string) => {
    if (!out.includes(t)) out.push(t);
  };
  for (const t of client) add(t);
  for (const t of derived) add(t);
  return out;
}

function isRecord(v: unknown): v is Record<string, unknown> {
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

async function fetchOpenMeteoWeatherSnapshot(lat: number, lon: number): Promise<string | null> {
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
    return JSON.stringify(payload);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchNominatimReverseGeocode(lat: number, lon: number): Promise<{
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
const MOTION_VARIANCE_ACTIVE_THRESHOLD = 1.25;

function buildVibeContextTags(input: {
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
 * Terrain elevation (m above sea level) at a point from Open-Elevation (SRTM-backed DEM).
 */
async function fetchTerrainElevationM(lat: number, lon: number): Promise<number | null> {
  const url = `https://api.open-elevation.com/api/v1/lookup?locations=${lat},${lon}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OPEN_ELEVATION_BIND_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    const data = (await res.json()) as { results?: { elevation?: unknown }[] };
    const raw = data.results?.[0]?.elevation;
    return typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const authHeader = req.headers.get('Authorization') ?? '';
  const jwt = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!jwt) {
    return new Response(JSON.stringify({ error: 'Missing Authorization bearer token' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({ error: 'Server misconfigured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userData?.user?.id) {
    return new Response(JSON.stringify({ error: 'Invalid session' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const uid = userData.user.id;

  let body: {
    my_token?: unknown;
    heard_tokens?: unknown[];
    latitude?: unknown;
    longitude?: unknown;
    gps_lat?: unknown;
    gps_lon?: unknown;
    exact_barometric_elevation_m?: unknown;
    noise_level?: unknown;
    exact_noise_level_db?: unknown;
    context_tags?: unknown;
    height_category?: unknown;
    lux_level?: unknown;
    motion_variance?: unknown;
    compass_azimuth?: unknown;
    battery_level?: unknown;
    location_name?: unknown;
    weather_snapshot?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const myToken = normalizeToken(body.my_token);
  if (!myToken) {
    return new Response(JSON.stringify({ error: 'Invalid my_token' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const heardTokens = (Array.isArray(body.heard_tokens) ? body.heard_tokens : [])
    .map(normalizeToken)
    .filter((t): t is string => t != null);

  const lat = finiteNumber(body.gps_lat) ?? finiteNumber(body.latitude);
  const lon = finiteNumber(body.gps_lon) ?? finiteNumber(body.longitude);
  const exactBarometricElevationM = finiteNumber(body.exact_barometric_elevation_m);
  const exactNoiseLevelDb = finiteNumber(body.exact_noise_level_db);
  const noiseLevel =
    typeof body.noise_level === 'string' && body.noise_level.trim().length > 0 ? body.noise_level.trim() : null;
  const clientContextTags = normalizeContextTagsArray(body.context_tags);
  const clientHeightCategory =
    typeof body.height_category === 'string' && body.height_category.trim().length > 0
      ? body.height_category.trim()
      : null;

  const selfLux = finiteNumber(body.lux_level);
  const selfMotion = finiteNumber(body.motion_variance);
  const selfAz = finiteNumber(body.compass_azimuth);
  const selfBattery = finiteBatteryPct(body.battery_level);
  const manualLocationName =
    typeof body.location_name === 'string' && body.location_name.trim().length > 0
      ? body.location_name.trim()
      : null;

  const clientWeatherSnapshot =
    typeof body.weather_snapshot === 'string' && body.weather_snapshot.trim().length > 0
      ? body.weather_snapshot.trim()
      : null;

  const cutoffIso = new Date(Date.now() - CLEANUP_GRACE_MS).toISOString();
  await admin.from('proximity_handshake_events').delete().lt('created_at', cutoffIso);

  await admin
    .from('proximity_handshake_events')
    .delete()
    .eq('user_id', uid)
    .gte('created_at', new Date(Date.now() - CLEANUP_GRACE_MS).toISOString());

  const { data: inserted, error: insErr } = await admin
    .from('proximity_handshake_events')
    .insert({
      user_id: uid,
      my_token: myToken,
      heard_tokens: heardTokens,
      lat,
      lon,
      lux_level: selfLux,
      motion_variance: selfMotion,
      compass_azimuth: selfAz,
      battery_level: selfBattery,
    })
    .select('id, created_at')
    .single();

  if (insErr || !inserted) {
    console.error('bind-proximity-connection insert:', insErr);
    return new Response(JSON.stringify({ error: 'Failed to record handshake' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const t0 = Date.parse(String(inserted.created_at));
  if (!Number.isFinite(t0)) {
    return new Response(JSON.stringify({ error: 'Invalid server timestamp' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const windowStart = new Date(t0 - MATCH_TIME_WINDOW_MS).toISOString();
  const { data: recent, error: qErr } = await admin
    .from('proximity_handshake_events')
    .select(
      'id, user_id, my_token, heard_tokens, lat, lon, lux_level, motion_variance, compass_azimuth, battery_level, created_at',
    )
    .gte('created_at', windowStart);

  if (qErr) {
    console.error('bind-proximity-connection query:', qErr);
    return new Response(JSON.stringify({ error: 'Failed to load peer handshakes' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const rows = (recent ?? []) as HandshakeRowLite[];
  const latestByUser = latestHandshakeRowPerUser(rows);
  const nodeRows = [...latestByUser.values()];
  const adj = buildUserAdjacency(nodeRows);
  const component = bfsComponent(uid, adj);
  const matchedIds = new Set<string>([...component].filter((id) => id !== uid));

  if (matchedIds.size === 0) {
    return new Response(
      JSON.stringify({
        success: true,
        encounter_logged: true,
        matches: [] as UserProfile[],
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  // For a single peer, remove this device's handshake row (legacy behavior). For 2+ peers (3+ people
  // in the tap cluster), keep this row for the TTL window so a slower device can still bind and
  // resolve the same graph without seeing an empty match list.
  if (matchedIds.size < 2) {
    await admin.from('proximity_handshake_events').delete().eq('id', String(inserted.id));
  }

  const ids = [...matchedIds];

  const encLat =
    lat != null && lon != null && !(lat === 0 && lon === 0) ? lat : null;
  const encLon =
    lat != null && lon != null && !(lat === 0 && lon === 0) ? lon : null;

  let relativeAltitudeM: number | null = null;
  let semanticLocation: Record<string, unknown> | null = null;
  let displayLocation = DISPLAY_LOCATION_FALLBACK;
  let specificLocationName: string | null = null;

  if (exactBarometricElevationM != null && encLat != null && encLon != null) {
    try {
      const terrainM = await fetchTerrainElevationM(encLat, encLon);
      if (terrainM != null) {
        relativeAltitudeM = exactBarometricElevationM - terrainM;
      }
    } catch {
      relativeAltitudeM = null;
    }
  }
  if (encLat != null && encLon != null) {
    const geocoded = await fetchNominatimReverseGeocode(encLat, encLon);
    semanticLocation = geocoded.semanticLocation;
    displayLocation = geocoded.displayLocation;
    specificLocationName = geocoded.specificLocationName;
  }
  const resolvedLocationName = manualLocationName ?? specificLocationName;

  async function lookupConnectionIdForPair(peerId: string): Promise<string | null> {
    const { data, error } = await admin
      .from('connections')
      .select('id, user_ids')
      .contains('user_ids', [uid, peerId]);
    if (error || !data?.length) return null;
    const row = (data as { id: string; user_ids?: string[] }[]).find((r) => {
      const u = r.user_ids ?? [];
      return u.includes(uid) && u.includes(peerId);
    });
    return row?.id ?? null;
  }

  /**
   * Returns an existing pairwise connection or creates one (+ chat row) using the same shape as mobile `proximity` create.
   * Never inserts when a row already exists (avoids unique constraint failures on N-way / concurrent binds);
   * callers still log `connection_encounters` for reunions.
   */
  async function ensureConnectionForPair(peerId: string): Promise<{ connectionId: string; isNewConnection: boolean } | null> {
    const existingId = await lookupConnectionIdForPair(peerId);
    if (existingId) {
      return { connectionId: existingId, isNewConnection: false };
    }
    const nowMs = Date.now();
    const expiryMs = nowMs + 30 * 24 * 60 * 60 * 1000;
    const hasGps = encLat != null && encLon != null;
    const proximityConfidence = hasGps ? 65 : 50;
    const proximitySignals = {
      connection_method: 'proximity',
      gps_available: hasGps,
      bind_source: 'bind-proximity-connection',
    };
    const insertRow: Record<string, unknown> = {
      user_ids: [uid, peerId],
      created: nowMs,
      expiry: expiryMs,
      should_continue: [false, false],
      has_begun: false,
      expiry_state: 'pending',
      status: 'pending',
      include_in_business_insights: true,
      initiator_id: peerId,
      responder_id: uid,
      connection_method: 'proximity',
      proximity_confidence: proximityConfidence,
      flagged: proximityConfidence < 20,
      proximity_signals: proximitySignals,
      created_utc: new Date(nowMs).toISOString(),
      time_of_day_utc: utcTimeOfDayLabelFromMs(nowMs),
    };
    const { data: ins, error: insErr } = await admin.from('connections').insert(insertRow).select('id').single();
    if (insErr || !ins?.id) {
      if (isDuplicateKeyError(insErr)) {
        const retry = await lookupConnectionIdForPair(peerId);
        if (retry) return { connectionId: retry, isNewConnection: false };
      }
      console.error('bind-proximity-connection ensureConnection insert:', insErr);
      return null;
    }
    const connectionId = String(ins.id);
    const { error: chatErr } = await admin.from('chats').insert({
      connection_id: connectionId,
      created_at: nowMs,
      updated_at: nowMs,
    });
    if (chatErr && !isDuplicateKeyError(chatErr)) {
      console.warn('bind-proximity-connection ensureConnection chat:', chatErr.message);
    }
    return { connectionId, isNewConnection: true };
  }

  async function insertOrDebounceEncounter(
    connectionId: string,
    insertRow: Record<string, unknown>,
    encLat: number | null,
    encLon: number | null,
  ): Promise<EncounterMutationOutcome> {
    const encounteredAtIso = String(insertRow.encountered_at ?? '');
    const newBlock = twelveHourUtcBlockId(encounteredAtIso);
    if (encLat == null || encLon == null || newBlock == null) {
      const { error: encErr } = await admin.from('connection_encounters').insert(insertRow);
      if (encErr) {
        const msg = encErr.message ?? '';
        if (msg.includes('encounter_rate_limit_3h')) {
          const nowMs = Date.now();
          await admin.from('chats').update({ updated_at: nowMs }).eq('connection_id', connectionId);
          return 'rate_limited';
        }
        console.warn('bind-proximity-connection encounter:', encErr.message);
        return 'insert_error';
      }
      return 'inserted';
    }

    const { data: lastRow, error: lastErr } = await admin
      .from('connection_encounters')
      .select('id, gps_lat, gps_lon, encountered_at, context_tags')
      .eq('connection_id', connectionId)
      .order('encountered_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastErr) {
      console.warn('bind-proximity-connection last encounter:', lastErr.message);
    }

    const last = lastRow as {
      id?: string;
      gps_lat?: number | null;
      gps_lon?: number | null;
      encountered_at?: string;
      context_tags?: string[] | null;
    } | null;

    const lastLat = last?.gps_lat != null && Number.isFinite(Number(last.gps_lat)) ? Number(last.gps_lat) : null;
    const lastLon = last?.gps_lon != null && Number.isFinite(Number(last.gps_lon)) ? Number(last.gps_lon) : null;
    const lastAt = typeof last?.encountered_at === 'string' ? last.encountered_at : null;
    const lastBlock = lastAt ? twelveHourUtcBlockId(lastAt) : null;

    const canDebounce =
      last?.id &&
      lastLat != null &&
      lastLon != null &&
      lastBlock != null &&
      lastBlock === newBlock &&
      haversineMeters(encLat, encLon, lastLat, lastLon) <= ENCOUNTER_DEBOUNCE_MAX_M;

    if (canDebounce && last.id) {
      const prevTags = Array.isArray(last.context_tags) ? [...last.context_tags] : [];
      const merged = [...new Set([...prevTags, EXTENDED_HANGOUT_TAG])];
      const { error: upErr } = await admin
        .from('connection_encounters')
        .update({ context_tags: merged })
        .eq('id', last.id);
      if (upErr) {
        console.warn('bind-proximity-connection encounter debounce update:', upErr.message);
        return 'debounce_update_error';
      }
      return 'debounced';
    }

    const { error: encErr } = await admin.from('connection_encounters').insert(insertRow);
    if (encErr) {
      const msg = encErr.message ?? '';
      if (msg.includes('encounter_rate_limit_3h')) {
        const nowMs = Date.now();
        await admin.from('chats').update({ updated_at: nowMs }).eq('connection_id', connectionId);
        return 'rate_limited';
      }
      console.warn('bind-proximity-connection encounter:', encErr.message);
      return 'insert_error';
    }
    return 'inserted';
  }

  type PeerBindMeta = {
    peerId: string;
    connectionId: string | null;
    encounterLogged: boolean;
    isNewConnection: boolean;
    encounterPersistedOnBind: boolean;
    reason?: string;
  };
  const peerEncounterLogged: PeerBindMeta[] = [];

  for (const peerId of ids) {
    const ensured = await ensureConnectionForPair(peerId);
    if (!ensured) {
      peerEncounterLogged.push({
        peerId,
        connectionId: null,
        encounterLogged: false,
        isNewConnection: true,
        encounterPersistedOnBind: false,
        reason: 'connection_unavailable',
      });
      continue;
    }
    const { connectionId, isNewConnection } = ensured;

    const peerRow = rows.find((r) => r && String(r.user_id) === peerId) as Record<string, unknown> | undefined;
    const peerMotion = peerRow ? finiteNumber(peerRow.motion_variance) : null;
    const peerAz = peerRow ? finiteNumber(peerRow.compass_azimuth) : null;
    const vibeTags = buildVibeContextTags({
      lux: selfLux,
      selfMotion,
      peerMotion,
      selfAz,
      peerAz,
      battery: selfBattery,
    });
    const mergedContextTags = mergeContextTagLists(clientContextTags, vibeTags);
    const insertRow: Record<string, unknown> = {
      connection_id: connectionId,
      encountered_at: new Date().toISOString(),
      context_tags: mergedContextTags,
      display_location: displayLocation,
    };
    if (resolvedLocationName) {
      insertRow.location_name = resolvedLocationName;
    }
    if (encLat != null && encLon != null) {
      insertRow.gps_lat = encLat;
      insertRow.gps_lon = encLon;
    }
    if (semanticLocation != null) insertRow.semantic_location = semanticLocation;
    if (noiseLevel != null) insertRow.noise_level = noiseLevel;
    if (exactNoiseLevelDb != null) insertRow.exact_noise_level_db = exactNoiseLevelDb;
    if (exactBarometricElevationM != null) {
      insertRow.exact_barometric_elevation_m = exactBarometricElevationM;
    }
    if (clientHeightCategory != null) {
      insertRow.elevation_category = clientHeightCategory;
    }
    if (relativeAltitudeM != null) insertRow.relative_altitude_m = relativeAltitudeM;
    if (selfLux != null) insertRow.lux_level = selfLux;
    if (selfMotion != null) insertRow.motion_variance = selfMotion;
    if (selfAz != null) insertRow.compass_azimuth = selfAz;
    if (selfBattery != null) insertRow.battery_level = selfBattery;

    let resolvedWeather = clientWeatherSnapshot;
    if (resolvedWeather == null && encLat != null && encLon != null) {
      resolvedWeather = await fetchOpenMeteoWeatherSnapshot(encLat, encLon);
    }
    if (resolvedWeather != null) {
      insertRow.weather_snapshot = resolvedWeather;
    }

    const outcome = await insertOrDebounceEncounter(connectionId, insertRow, encLat, encLon);
    const persisted = outcome === 'inserted' || outcome === 'debounced';
    if (outcome === 'rate_limited') {
      peerEncounterLogged.push({
        peerId,
        connectionId,
        encounterLogged: false,
        isNewConnection,
        encounterPersistedOnBind: false,
        reason: 'rate_limit_active',
      });
    } else {
      peerEncounterLogged.push({
        peerId,
        connectionId,
        encounterLogged: true,
        isNewConnection,
        encounterPersistedOnBind: persisted,
        ...(outcome === 'insert_error' || outcome === 'debounce_update_error'
          ? { reason: 'encounter_mutation_failed' as const }
          : {}),
      });
    }
  }

  const aggregateEncounterLogged = peerEncounterLogged.some((p) => p.encounterLogged);

  const { data: users, error: uErr } = await admin
    .from('users')
    .select('id, name, email, image, created_at')
    .in('id', ids);

  if (uErr) {
    console.error('bind-proximity-connection users:', uErr);
    return new Response(JSON.stringify({ error: 'Failed to load user profiles' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const metaByPeer = new Map(peerEncounterLogged.map((p) => [p.peerId, p]));

  const matches: UserProfile[] = (users ?? []).map((u: Record<string, unknown>) => {
    const id = String(u.id);
    const meta = metaByPeer.get(id);
    const encounter_logged = meta?.encounterLogged ?? true;
    const base: UserProfile = {
      id,
      name: (u.name as string | null | undefined) ?? null,
      email: (u.email as string | null | undefined) ?? null,
      image: (u.image as string | null | undefined) ?? null,
      created_at:
        typeof u.created_at === 'string'
          ? Date.parse(u.created_at)
          : typeof u.created_at === 'number'
            ? u.created_at
            : 0,
      connection_id: meta?.connectionId ?? null,
      encounter_logged,
      is_new_connection: meta?.isNewConnection ?? true,
      encounter_persisted_on_bind: meta?.encounterPersistedOnBind ?? false,
      ...(meta?.reason ? { reason: meta.reason } : {}),
    };
    return base;
  });

  const responseBody: Record<string, unknown> = {
    success: true,
    encounter_logged: aggregateEncounterLogged,
    matches,
  };
  if (matchedIds.size >= 2) {
    responseBody.group_clique_candidate = {
      member_user_ids: [...component].sort(),
    };
  }
  if (matches.length === 1) {
    const only = matches[0];
    if (only?.connection_id != null) {
      responseBody.connection_id = only.connection_id;
      responseBody.is_new_connection = only.is_new_connection;
    }
  }

  return new Response(JSON.stringify(responseBody), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
