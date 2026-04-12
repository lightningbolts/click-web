import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import type { ConnectionLifecycleStatus } from '@/types/connection';
import { ACTIVE_CONNECTIONS_DB_OR_FILTER } from '@/lib/dashboard/connectionStatus';
import { getSupabaseFromRouteRequest } from '@/lib/server/supabaseRouteAuth';
import { fetchTerrainElevationMeters } from '@/lib/server/terrainElevation';
import {
  normalizeContextTag,
  normalizeNoiseLevelCategory,
  resolveContextTagId,
  type ContextTagPayload,
} from '@/lib/server/connectionEncounterContextTag';

/**
 * Connections API
 *
 * GET    → Fetch connections (`statusScope`: default active | `archived` | `map` = all non-hidden for memory map)
 * POST   → Create a new connection with proximity validation (Layers 2 & 3)
 * DELETE → Per-user hide: insert into `connection_hidden` (no `connections` row delete, no `status = removed`)
 * PATCH  → Restore from archive: delete `connection_archives` row (legacy `status = archived` fallback)
 */

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createAdminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );
}

const NOMINATIM_REVERSE_TIMEOUT_MS = 3_500;
const NOMINATIM_USER_AGENT = 'ClickPlatformsApp/1.0 (contact@click.com)';
const DISPLAY_LOCATION_FALLBACK = 'A new city';

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function finiteNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function normalizeClientNoiseLevelString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeElevationCategoryString(value: unknown): string | null {
  return normalizeClientNoiseLevelString(value);
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
  const topLevelName = firstNonEmptyString([semanticLocation.name]);
  if (topLevelName) return topLevelName;

  const address = isRecord(semanticLocation.address) ? semanticLocation.address : null;
  if (!address) return null;

  return firstNonEmptyString([
    address.amenity,
    address.building,
    address.residential,
    address.road,
  ]);
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
      cache: 'no-store',
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

/**
 * Haversine distance in meters between two lat/lon coordinate pairs.
 */
function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_000; // Earth radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Compute the Proximity Confidence Score (0–100).
 *
 * | Signal                          | Points |
 * |─────────────────────────────────|────────|
 * | NFC connection method           | +50    |
 * | GPS distance < 10m              | +30    |
 * | GPS distance 10–50m             | +15    |
 * | GPS distance 50–100m            | +5     |
 * | GPS distance > 100m             | −40    |
 * | QR token age < 30s              | +10    |
 * | QR token age 30–60s             | +5     |
 * | QR token age > 60s              |  0     |
 * | Same WiFi BSSID                 | +15    |
 */
function computeProximityScore(params: {
  connectionMethod: string;
  gpsDistanceMeters: number | null;
  tokenAgeSeconds: number | null;
  sharedBssid: boolean;
  gpsAvailable: boolean;
}): { score: number; signals: Record<string, unknown> } {
  const { connectionMethod, gpsDistanceMeters, tokenAgeSeconds, sharedBssid, gpsAvailable } = params;

  let score = 0;

  // Connection method baseline
  if (connectionMethod === 'nfc' || connectionMethod === 'proximity') {
    score += 50;
  }

  // GPS distance scoring
  if (gpsDistanceMeters !== null && gpsAvailable) {
    if (gpsDistanceMeters < 10) score += 30;
    else if (gpsDistanceMeters <= 50) score += 15;
    else if (gpsDistanceMeters <= 100) score += 5;
    else score -= 40;
  }

  // QR token age scoring
  if (tokenAgeSeconds !== null) {
    if (tokenAgeSeconds < 30) score += 10;
    else if (tokenAgeSeconds <= 60) score += 5;
    // > 60s = 0 points
  }

  // WiFi BSSID match
  if (sharedBssid) {
    score += 15;
  }

  // Clamp to [0, 100]
  score = Math.max(0, Math.min(100, score));

  const signals: Record<string, unknown> = {
    gps_distance_meters: gpsDistanceMeters !== null ? Math.round(gpsDistanceMeters * 10) / 10 : null,
    token_age_seconds: tokenAgeSeconds !== null ? Math.round(tokenAgeSeconds) : null,
    shared_bssid: sharedBssid,
    connection_method: connectionMethod,
    gps_available: gpsAvailable,
  };

  return { score, signals };
}

type MemoryCapsulePayload = {
  connectionId: string;
  locationName: string | null;
  geoLocation: { lat: number; lon: number } | null;
  connectedAtMs: number;
  weatherSnapshot: {
    condition: string;
    temperatureCelsius: number;
    iconCode: string | null;
  } | null;
  contextTag: ContextTagPayload | null;
  photoUri: string | null;
  noiseLevelCategory: 'VERY_QUIET' | 'QUIET' | 'MODERATE' | 'LOUD' | 'VERY_LOUD' | null;
};

function buildUtcTimeOfDayLabel(isoTimestamp: string): string {
  return `${isoTimestamp.slice(11, 19)} UTC`;
}

function toConditionLabel(weatherCode: number): string {
  if (weatherCode === 0) return 'Sunny';
  if ([1, 2, 3].includes(weatherCode)) return 'Cloudy';
  if ([45, 48].includes(weatherCode)) return 'Foggy';
  if ([51, 53, 55, 56, 57].includes(weatherCode)) return 'Drizzly';
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(weatherCode)) return 'Rainy';
  if ([71, 73, 75, 77, 85, 86].includes(weatherCode)) return 'Snowy';
  if ([95, 96, 99].includes(weatherCode)) return 'Stormy';
  return 'Clear';
}

function toIconCode(weatherCode: number): string {
  if (weatherCode === 0) return 'clear';
  if ([1, 2, 3].includes(weatherCode)) return 'cloudy';
  if ([45, 48].includes(weatherCode)) return 'fog';
  if ([51, 53, 55, 56, 57].includes(weatherCode)) return 'drizzle';
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(weatherCode)) return 'rain';
  if ([71, 73, 75, 77, 85, 86].includes(weatherCode)) return 'snow';
  if ([95, 96, 99].includes(weatherCode)) return 'thunder';
  return 'clear';
}

async function enrichEncounterWeather(
  adminClient: ReturnType<typeof createAdminClient>,
  connectionId: string,
  lat: number,
  lon: number,
  memoryCapsule: MemoryCapsulePayload,
) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) {
    return;
  }

  try {
    const weatherResponse = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`,
      { cache: 'no-store' }
    );

    if (!weatherResponse.ok) {
      return;
    }

    const weatherJson = await weatherResponse.json() as {
      current_weather?: { temperature?: number; weathercode?: number };
    };
    const currentWeather = weatherJson.current_weather;
    if (
      currentWeather?.temperature == null ||
      currentWeather.weathercode == null
    ) {
      return;
    }

    const enrichedCapsule: MemoryCapsulePayload = {
      ...memoryCapsule,
      weatherSnapshot: {
        condition: toConditionLabel(currentWeather.weathercode),
        temperatureCelsius: currentWeather.temperature,
        iconCode: toIconCode(currentWeather.weathercode),
      },
    };

    const { data: latestEnc, error: encLookupErr } = await adminClient
      .from('connection_encounters')
      .select('id')
      .eq('connection_id', connectionId)
      .order('encountered_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (encLookupErr || !latestEnc?.id) {
      if (encLookupErr) console.error('Encounter lookup for weather:', encLookupErr);
      return;
    }

    const { error } = await adminClient
      .from('connection_encounters')
      .update({
        weather_snapshot: enrichedCapsule.weatherSnapshot,
      })
      .eq('id', latestEnc.id);

    if (error) {
      console.error('Encounter weather update error:', error);
    }
  } catch (error) {
    console.error('Memory capsule weather fetch error:', error);
  }
}

// ─── GET — fetch user's connections ──────────────────────────────────────────

const INSIGHTS_QUERY_PARAM = 'includeInsights';
/** `active` (default) | `archived` — ignored when `includeInsights` is set */
const STATUS_SCOPE_PARAM = 'statusScope';

function isInsightsScope(searchParams: URLSearchParams): boolean {
  const v = searchParams.get(INSIGHTS_QUERY_PARAM);
  return v === '1' || v?.toLowerCase() === 'true';
}

type UserScopedSupabase = SupabaseClient;

/**
 * Per-user junction rows (`connection_archives`, `connection_hidden`).
 * If a table is missing from the schema cache, return [] so the main connections query still works.
 */
function isJunctionTableOptionalError(error: { code?: string; message?: string }): boolean {
  const code = error.code;
  const msg = String(error.message || '').toLowerCase();
  return (
    code === 'PGRST205' ||
    msg.includes('schema cache') ||
    msg.includes('does not exist')
  );
}

/**
 * Lazy-sweep stale rows into `connection_archives` for this user before any connections read.
 * Must run while the caller still holds a valid JWT so `auth.uid()` matches in the RPC.
 */
async function sweepStaleConnectionsForUser(
  supabase: UserScopedSupabase,
  userId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { error } = await supabase.rpc('sweep_stale_connections_for_user', {
    target_user_id: userId,
  });
  if (error) {
    return { ok: false, message: error.message };
  }
  return { ok: true };
}

async function fetchJunctionConnectionIds(
  supabase: UserScopedSupabase,
  table: 'connection_archives' | 'connection_hidden',
  userId: string,
): Promise<string[]> {
  const { data, error } = await supabase.from(table).select('connection_id').eq('user_id', userId);

  if (!error) {
    const ids = (data ?? [])
      .map((row: { connection_id?: string }) => row.connection_id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);
    return [...new Set(ids)];
  }

  if (isJunctionTableOptionalError(error)) {
    console.warn(`[connections GET] ${table} optional junction unavailable:`, error.message);
    return [];
  }

  console.error(`[connections GET] ${table} query failed:`, error.message);
  return [];
}

function dedupeIds(ids: string[]): string[] {
  return [...new Set(ids)];
}

export async function GET(request: NextRequest) {
  try {
    const { supabase, user, authError: userError } = await getSupabaseFromRouteRequest(request);
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const sweep = await sweepStaleConnectionsForUser(supabase, user.id);
    if (!sweep.ok) {
      console.error('[connections GET] sweep_stale_connections_for_user failed:', sweep.message);
      return NextResponse.json({ error: sweep.message }, { status: 400 });
    }

    const searchParams = request.nextUrl.searchParams;
    const insights = isInsightsScope(searchParams);

    // Insights: full history — no junction filtering (avoids hiding rows from analytics views).
    if (insights) {
      const { data: connections, error } = await supabase
        .from('connections')
        .select('*, connection_encounters(*)')
        .contains('user_ids', [user.id])
        .order('created', { ascending: false })
        .order('encountered_at', { ascending: false, referencedTable: 'connection_encounters' });

      if (error) {
        console.error('Error fetching connections:', error);
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      return NextResponse.json({ connections: connections || [] });
    }

    const scope = searchParams.get(STATUS_SCOPE_PARAM)?.toLowerCase();

    const [archivedForUser, hiddenForUser] = await Promise.all([
      fetchJunctionConnectionIds(supabase, 'connection_archives', user.id),
      fetchJunctionConnectionIds(supabase, 'connection_hidden', user.id),
    ]);

    // ─── Memory map: every connection the user is on, minus `connection_hidden` only (no archive filter) ───
    if (scope === 'map') {
      const hiddenSet = new Set(hiddenForUser);
      let mapQuery = supabase
        .from('connections')
        .select('*, connection_encounters(*)')
        .contains('user_ids', [user.id])
        .order('created', { ascending: false })
        .order('encountered_at', { ascending: false, referencedTable: 'connection_encounters' });

      if (hiddenSet.size > 0) {
        mapQuery = mapQuery.not('id', 'in', `(${[...hiddenSet].join(',')})`);
      }

      const { data: mapConnections, error: mapError } = await mapQuery;

      if (mapError) {
        console.error('Error fetching map connections:', mapError);
        return NextResponse.json({ error: mapError.message }, { status: 400 });
      }

      return NextResponse.json({ connections: mapConnections || [] });
    }

    // ─── Archived channel: `connection_archives` ids minus `connection_hidden`, then `.in('id', …)` ───
    if (scope === 'archived') {
      const hiddenSet = new Set(hiddenForUser);
      const includeIds = archivedForUser.filter((id) => !hiddenSet.has(id));

      if (includeIds.length === 0) {
        return NextResponse.json({ connections: [] });
      }

      const { data: connections, error } = await supabase
        .from('connections')
        .select('*, connection_encounters(*)')
        .contains('user_ids', [user.id])
        .in('id', includeIds)
        .order('created', { ascending: false })
        .order('encountered_at', { ascending: false, referencedTable: 'connection_encounters' });

      if (error) {
        console.error('Error fetching archived connections:', error);
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      return NextResponse.json({ connections: connections || [] });
    }

    // ─── Active channel: visible lifecycle states, excluding archived ∪ hidden junction ids ───
    const excludedIds = dedupeIds([...archivedForUser, ...hiddenForUser]);

    let query = supabase
      .from('connections')
      .select('*, connection_encounters(*)')
      .contains('user_ids', [user.id])
      .or(ACTIVE_CONNECTIONS_DB_OR_FILTER)
      .order('created', { ascending: false })
      .order('encountered_at', { ascending: false, referencedTable: 'connection_encounters' });

    if (excludedIds.length > 0) {
      query = query.not('id', 'in', `(${excludedIds.join(',')})`);
    }

    const { data: connections, error } = await query;

    if (error) {
      console.error('Error fetching connections:', error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ connections: connections || [] });
  } catch (error) {
    console.error('Server error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ─── PATCH — restore: remove `connection_archives` row (legacy `status` fallback) ─

type PatchBody = {
  action?: string;
  connectionId?: string;
  id?: string;
};

export async function PATCH(request: NextRequest) {
  try {
    const { user, authError: userError } = await getSupabaseFromRouteRequest(request);
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body: PatchBody;
    try {
      body = (await request.json()) as PatchBody;
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    if (body.action !== 'restore') {
      return NextResponse.json({ error: 'Unsupported action' }, { status: 400 });
    }

    const connectionId = (body.connectionId ?? body.id)?.trim();
    if (!connectionId) {
      return NextResponse.json({ error: 'connectionId is required' }, { status: 400 });
    }

    const adminClient = createAdminClient();

    const { data: row, error: fetchError } = await adminClient
      .from('connections')
      .select('id, user_ids, status')
      .eq('id', connectionId)
      .maybeSingle();

    if (fetchError) {
      console.error('Connection restore lookup error:', fetchError);
      return NextResponse.json({ error: fetchError.message }, { status: 400 });
    }

    const ids = (row?.user_ids as string[] | null) ?? [];
    if (!row || !ids.includes(user.id)) {
      return NextResponse.json({ error: 'Connection not found' }, { status: 404 });
    }

    const { data: removedArchiveRows, error: archiveDeleteError } = await adminClient
      .from('connection_archives')
      .delete()
      .eq('user_id', user.id)
      .eq('connection_id', connectionId)
      .select('id');

    if (archiveDeleteError && !isJunctionTableOptionalError(archiveDeleteError)) {
      console.error('Connection archive restore error:', archiveDeleteError);
      return NextResponse.json({ error: archiveDeleteError.message }, { status: 400 });
    }

    if ((removedArchiveRows?.length ?? 0) > 0) {
      // Manual unarchive: `kept` shields the row from sweep_stale_connections_for_user (pending/active only).
      const keptStatus: ConnectionLifecycleStatus = 'kept';
      const { data: connection, error: keepUpdateError } = await adminClient
        .from('connections')
        .update({ status: keptStatus })
        .eq('id', connectionId)
        .select()
        .maybeSingle();

      if (keepUpdateError) {
        console.error('Connection unarchive status update error:', keepUpdateError);
        return NextResponse.json({ error: keepUpdateError.message }, { status: 400 });
      }

      return NextResponse.json({ success: true, connection });
    }

    if (row.status === 'archived') {
      const keptStatus: ConnectionLifecycleStatus = 'kept';
      const { data: updated, error: updateError } = await adminClient
        .from('connections')
        .update({ status: keptStatus })
        .eq('id', connectionId)
        .select()
        .maybeSingle();

      if (updateError) {
        console.error('Connection legacy restore error:', updateError);
        return NextResponse.json({ error: updateError.message }, { status: 400 });
      }

      return NextResponse.json({ success: true, connection: updated });
    }

    return NextResponse.json(
      { error: 'Connection is not archived for this user' },
      { status: 409 },
    );
  } catch (error) {
    console.error('Connection PATCH error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ─── DELETE — per-user hide (`connection_hidden`, not `connections` delete) ─

export async function DELETE(request: NextRequest) {
  try {
    const { user, authError: userError } = await getSupabaseFromRouteRequest(request);
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const connectionId =
      request.nextUrl.searchParams.get('connectionId') ??
      request.nextUrl.searchParams.get('id');
    if (!connectionId?.trim()) {
      return NextResponse.json({ error: 'connectionId is required' }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const trimmedId = connectionId.trim();

    const { data: row, error: fetchError } = await adminClient
      .from('connections')
      .select('id, user_ids')
      .eq('id', trimmedId)
      .maybeSingle();

    if (fetchError) {
      console.error('Connection lookup error:', fetchError);
      return NextResponse.json({ error: fetchError.message }, { status: 400 });
    }

    const ids = (row?.user_ids as string[] | null) ?? [];
    if (!row || !ids.includes(user.id)) {
      return NextResponse.json({ error: 'Connection not found' }, { status: 404 });
    }

    const hiddenAt = new Date().toISOString();
    const hiddenRows = ids.map((participantId) => ({
      user_id: participantId,
      connection_id: trimmedId,
      hidden_at: hiddenAt,
    }));
    const { error: insertError } = await adminClient
      .from('connection_hidden')
      .upsert(hiddenRows, { onConflict: 'user_id,connection_id' });

    if (!insertError) {
      return NextResponse.json({ success: true, connectionId: trimmedId });
    }

    if (isJunctionTableOptionalError(insertError)) {
      console.error('connection_hidden unavailable:', insertError.message);
      return NextResponse.json(
        { error: 'Hide is not available (database configuration)' },
        { status: 503 },
      );
    }

    console.error('Connection hide error:', insertError);
    return NextResponse.json({ error: insertError.message }, { status: 400 });
  } catch (error) {
    console.error('Connection DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ─── POST — create connection with proximity validation ──────────────────────

export async function POST(request: NextRequest) {
  try {
    const { user, authError: userError } = await getSupabaseFromRouteRequest(request);
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const rawBody = await request.json();
    const body = isRecord(rawBody) ? rawBody : {};

    const userId1 = typeof body.userId1 === 'string' ? body.userId1 : null;
    const userId2 = typeof body.userId2 === 'string' ? body.userId2 : null;
    const location1 = isRecord(body.location1) ? body.location1 : null;
    const location2 = isRecord(body.location2) ? body.location2 : null;
    const connectionMethod =
      typeof body.connectionMethod === 'string' && body.connectionMethod.trim().length > 0
        ? body.connectionMethod.trim()
        : 'qr';
    const tokenAgeMs = finiteNumber(body.tokenAgeMs);
    const wifiBssid1 = typeof body.wifiBssid1 === 'string' ? body.wifiBssid1 : undefined;
    const wifiBssid2 = typeof body.wifiBssid2 === 'string' ? body.wifiBssid2 : undefined;
    const contextTag = body.contextTag;
    const contextTagObject = body.contextTagObject;
    const initiatorId = body.initiatorId;
    const responderId = body.responderId;
    const initiator_id = body.initiator_id;
    const responder_id = body.responder_id;
    const location_name = body.location_name;
    const noiseLevelCategory = body.noiseLevelCategory ?? body.noise_level_category;
    const heightCategoryRaw = body.height_category ?? body.heightCategory;
    const elevationCategoryRaw = body.elevation_category ?? body.elevationCategory;
    const exactNoiseLevelDb =
      body.exactNoiseLevelDb ??
      body.exact_noise_level_db;
    const exactBarometricElevationMeters =
      body.exactBarometricElevationMeters ??
      body.exact_barometric_elevation_m;
    const clientNoiseLevelString = normalizeClientNoiseLevelString(
      body.noise_level ?? body.noiseLevel,
    );

    // Validate required fields
    if (!userId1 || !userId2) {
      return NextResponse.json({ error: 'Missing userId1 or userId2' }, { status: 400 });
    }

    // Prevent self-connection
    if (userId1 === userId2) {
      return NextResponse.json({ error: 'Cannot connect with yourself' }, { status: 400 });
    }

    const adminClient = createAdminClient();

    // ── Layer 2: GPS proximity validation ──

    const loc1Lat = location1 ? finiteNumber(location1.lat) : null;
    const loc1Lon = location1 ? finiteNumber(location1.lon) : null;
    const loc2Lat = location2 ? finiteNumber(location2.lat) : null;
    const loc2Lon = location2 ? finiteNumber(location2.lon) : null;

    const loc1Valid =
      loc1Lat != null && loc1Lon != null && !(loc1Lat === 0 && loc1Lon === 0);
    const loc2Valid =
      loc2Lat != null && loc2Lon != null && !(loc2Lat === 0 && loc2Lon === 0);

    let gpsDistanceMeters: number | null = null;
    const gpsAvailable = loc1Valid || loc2Valid;

    if (loc1Valid && loc2Valid) {
      gpsDistanceMeters = haversineMeters(loc1Lat, loc1Lon, loc2Lat, loc2Lon);

      // Hard reject if distance > 150m
      if (gpsDistanceMeters > 150) {
        return NextResponse.json({
          error: 'proximity_check_failed',
          distance: Math.round(gpsDistanceMeters),
          message: 'Users appear to be too far apart for a physical connection',
        }, { status: 422 });
      }
    }

    // ── Layer 3: proximity confidence score ──

    const tokenAgeSeconds = tokenAgeMs != null ? tokenAgeMs / 1000 : null;
    const sharedBssid = !!(wifiBssid1 && wifiBssid2 && wifiBssid1 === wifiBssid2);

    const { score: proximityConfidence, signals: proximitySignals } = computeProximityScore({
      connectionMethod,
      gpsDistanceMeters,
      tokenAgeSeconds,
      sharedBssid,
      gpsAvailable,
    });

    const { data: pairCandidates, error: existingErr } = await adminClient
      .from('connections')
      .select('id, status, user_ids, last_message_at, should_continue, has_begun')
      .contains('user_ids', [userId1]);

    if (existingErr) {
      console.error('Connection existing row lookup error:', existingErr);
      return NextResponse.json({ error: existingErr.message }, { status: 500 });
    }

    const existing = (pairCandidates ?? []).find((row) => {
      const ids = (row.user_ids as string[] | null) ?? [];
      return ids.includes(userId1) && ids.includes(userId2);
    }) as
      | {
          id: string;
          status: string | null;
          user_ids: string[];
          last_message_at: number | null;
          should_continue: boolean[] | null;
          has_begun: boolean | null;
        }
      | undefined;

    // Compute geo_location without midpoint averaging to preserve real observed points.
    // If both are available, prefer initiator location1.
    let geoLocation: { lat: number; lon: number };
    if (loc1Valid && loc2Valid) {
      geoLocation = { lat: loc1Lat, lon: loc1Lon };
    } else if (loc1Valid) {
      geoLocation = { lat: loc1Lat, lon: loc1Lon };
    } else if (loc2Valid && loc2Lat != null && loc2Lon != null) {
      geoLocation = { lat: loc2Lat, lon: loc2Lon };
    } else {
      // No GPS available — use a null-island sentinel that the frontend filters out
      geoLocation = { lat: 0, lon: 0 };
    }

    const now = Date.now();
    const createdUtc = new Date(now).toISOString();
    const timeOfDayUtc = buildUtcTimeOfDayLabel(createdUtc);
    const expiry = now + 30 * 24 * 60 * 60 * 1000; // 30 days
    const resolvedContextTag = normalizeContextTag(contextTagObject ?? contextTag);
    const resolvedContextTagId = resolveContextTagId(resolvedContextTag);
    const enumNoiseLevel = normalizeNoiseLevelCategory(noiseLevelCategory);
    const resolvedNoiseForEncounter =
      enumNoiseLevel ?? clientNoiseLevelString ?? normalizeNoiseLevelCategory(heightCategoryRaw);
    const resolvedElevationCategory =
      normalizeElevationCategoryString(elevationCategoryRaw) ??
      normalizeElevationCategoryString(heightCategoryRaw);
    const resolvedInitiatorId = initiator_id ?? initiatorId ?? (connectionMethod === 'qr' ? userId2 : userId1);
    const resolvedResponderId = responder_id ?? responderId ?? (connectionMethod === 'qr' ? userId1 : userId2);

    const memoryCapsuleBase: Omit<MemoryCapsulePayload, 'connectionId'> = {
      locationName: null,
      geoLocation: geoLocation.lat === 0 && geoLocation.lon === 0 ? null : geoLocation,
      connectedAtMs: now,
      weatherSnapshot: null,
      contextTag: resolvedContextTag,
      photoUri: null,
      noiseLevelCategory: enumNoiseLevel,
    };

    const userIdsForRow = existing?.user_ids ?? [userId1, userId2];

    const sharedConnectionFields = {
      user_ids: userIdsForRow,
      created: now,
      created_utc: createdUtc,
      time_of_day_utc: timeOfDayUtc,
      expiry,
      should_continue:
        existing && Array.isArray(existing.should_continue) && existing.should_continue.length >= 2
          ? existing.should_continue
          : [false, false],
      has_begun: existing?.has_begun === true,
      proximity_confidence: proximityConfidence,
      proximity_signals: proximitySignals,
      connection_method: connectionMethod,
      flagged: proximityConfidence < 20,
      initiator_id: resolvedInitiatorId,
      responder_id: resolvedResponderId,
    };

    const activeLifecycle: ConnectionLifecycleStatus = 'active';

    /** Soft-delete / reconnect: always revive as active + bump timestamps (see unique_user_pair restore path). */
    const restorationConnectionData = {
      ...sharedConnectionFields,
      status: activeLifecycle,
      expiry_state: activeLifecycle,
      last_message_at: now,
    };

    const newConnectionData = {
      ...sharedConnectionFields,
      status: 'pending' as ConnectionLifecycleStatus,
      expiry_state: 'pending' as ConnectionLifecycleStatus,
      should_continue: [false, false] as boolean[],
      has_begun: false,
    };

    let connection: { id: string };
    const reusingExistingPair = !!existing;

    if (existing) {
      const pairIds = (existing.user_ids ?? []).filter((x): x is string => typeof x === 'string' && x.length > 0);
      if (pairIds.length >= 2) {
        const { error: hidDelErr } = await adminClient
          .from('connection_hidden')
          .delete()
          .eq('connection_id', existing.id)
          .in('user_id', pairIds);
        if (hidDelErr && !isJunctionTableOptionalError(hidDelErr)) {
          console.error('connection_hidden clear on restore:', hidDelErr);
        }
        const { error: archDelErr } = await adminClient
          .from('connection_archives')
          .delete()
          .eq('connection_id', existing.id)
          .in('user_id', pairIds);
        if (archDelErr && !isJunctionTableOptionalError(archDelErr)) {
          console.error('connection_archives clear on restore:', archDelErr);
        }
      }

      const { data: updated, error: updateError } = await adminClient
        .from('connections')
        .update(restorationConnectionData)
        .eq('id', existing.id)
        .select()
        .single();

      if (updateError) {
        console.error('Connection restore update error:', updateError);
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }
      connection = updated;
    } else {
      const { data: inserted, error: insertError } = await adminClient
        .from('connections')
        .insert(newConnectionData)
        .select()
        .single();

      if (insertError) {
        console.error('Connection insert error:', insertError);
        return NextResponse.json({ error: insertError.message }, { status: 500 });
      }
      connection = inserted;
    }

    // Existing 1:1 pairs already have a chat row; avoid duplicate chat threads on repeat QR scans.
    if (!reusingExistingPair) {
      const { error: chatError } = await adminClient
        .from('chats')
        .insert({
          connection_id: connection.id,
          created_at: now,
          updated_at: now,
        });

      if (chatError) {
        console.error('Chat creation error (non-fatal):', chatError);
        // Non-fatal — connection was created
      }
    }

    const memoryCapsule: MemoryCapsulePayload = {
      connectionId: connection.id,
      ...memoryCapsuleBase,
    };

    const manualLocationName =
      typeof location_name === 'string' && location_name.trim().length > 0
        ? location_name.trim()
        : null;

    let semanticLocation: Record<string, unknown> | null = null;
    let displayLocation = DISPLAY_LOCATION_FALLBACK;
    let specificLocationName: string | null = null;
    if (
      Number.isFinite(geoLocation.lat) &&
      Number.isFinite(geoLocation.lon) &&
      !(geoLocation.lat === 0 && geoLocation.lon === 0)
    ) {
      const geocoded = await fetchNominatimReverseGeocode(geoLocation.lat, geoLocation.lon);
      semanticLocation = geocoded.semanticLocation;
      displayLocation = geocoded.displayLocation;
      specificLocationName = geocoded.specificLocationName;
    }

    const encounterInsert: Record<string, unknown> = {
      connection_id: connection.id,
      encountered_at: new Date(now).toISOString(),
      display_location: displayLocation,
      context_tags: resolvedContextTagId ? [resolvedContextTagId] : [],
      weather_snapshot: memoryCapsule.weatherSnapshot,
    };
    if (resolvedNoiseForEncounter != null) {
      encounterInsert.noise_level = resolvedNoiseForEncounter;
    }
    if (resolvedElevationCategory != null) {
      encounterInsert.elevation_category = resolvedElevationCategory;
    }
    const resolvedLocationName = manualLocationName ?? specificLocationName ?? memoryCapsule.locationName;
    if (resolvedLocationName) {
      encounterInsert.location_name = resolvedLocationName;
    }
    if (
      Number.isFinite(geoLocation.lat) &&
      Number.isFinite(geoLocation.lon) &&
      !(geoLocation.lat === 0 && geoLocation.lon === 0)
    ) {
      encounterInsert.gps_lat = geoLocation.lat;
      encounterInsert.gps_lon = geoLocation.lon;
    }
    if (semanticLocation != null) encounterInsert.semantic_location = semanticLocation;

    const encDb = finiteNumber(exactNoiseLevelDb);
    const encElev = finiteNumber(exactBarometricElevationMeters);
    if (encDb != null) {
      encounterInsert.exact_noise_level_db = encDb;
    }
    if (encElev != null) {
      encounterInsert.exact_barometric_elevation_m = encElev;
    }

    let relativeAltitudeM: number | null = null;
    if (
      encElev != null &&
      Number.isFinite(geoLocation.lat) &&
      Number.isFinite(geoLocation.lon) &&
      !(geoLocation.lat === 0 && geoLocation.lon === 0)
    ) {
      try {
        const terrainM = await fetchTerrainElevationMeters(geoLocation.lat, geoLocation.lon);
        if (terrainM != null) {
          relativeAltitudeM = encElev - terrainM;
        }
      } catch (openElevErr) {
        console.error('Open-Elevation lookup failed (non-fatal):', openElevErr);
      }
    }
    if (relativeAltitudeM != null) {
      encounterInsert.relative_altitude_m = relativeAltitudeM;
    }

    const { error: encounterErr } = await adminClient.from('connection_encounters').insert(encounterInsert);
    let encounter_logged = true;
    let encounter_reason: string | undefined;
    if (encounterErr) {
      const msg = encounterErr.message ?? '';
      if (msg.includes('encounter_rate_limit_3h')) {
        encounter_logged = false;
        encounter_reason = 'rate_limit_active';
        await adminClient.from('chats').update({ updated_at: now }).eq('connection_id', connection.id);
      } else {
        console.error('connection_encounters insert error:', encounterErr);
      }
    }

    void enrichEncounterWeather(
      adminClient,
      connection.id,
      geoLocation.lat,
      geoLocation.lon,
      memoryCapsule
    );

    return NextResponse.json({
      success: true,
      encounter_logged,
      ...(encounter_reason ? { reason: encounter_reason } : {}),
      connection_id: connection.id,
      connection,
      proximityConfidence,
    });

  } catch (error) {
    console.error('Connection creation error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
