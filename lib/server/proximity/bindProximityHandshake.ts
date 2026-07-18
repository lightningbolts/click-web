import type { SupabaseClient } from '@supabase/supabase-js';
import { createCollaborationSessionForConnection } from '@/lib/collaboration/createCollaborationSession';
import { fetchTerrainElevationMeters } from '@/lib/server/terrainElevation';
import { normalizeContextTagsArray } from '@/lib/server/connectionEncounterContextTag';
import {
  bfsComponent,
  buildUserAdjacency,
  buildVibeContextTags,
  ENCOUNTER_DEBOUNCE_MAX_M,
  EXTENDED_HANGOUT_TAG,
  finiteBatteryPct,
  finiteNumber,
  haversineMeters,
  handshakeCreatedAtMs,
  isDuplicateKeyError,
  isEncounterRateLimitError,
  latestHandshakeRowPerUser,
  mergeContextTagLists,
  normalizeToken,
  parseHeardTokensField,
  peerEvidenceTokens,
  PROXIMITY_GROUP_COALESCE_MIN_MS,
  RECENT_CONNECTION_LOCK_MS,
  sameMemberSet,
  twelveHourUtcBlockId,
  tokenEvidenceBetweenRows,
  type HandshakeRowLite,
  utcTimeOfDayLabelFromMs,
} from '@/lib/server/proximity/matching';
import type {
  PendingHandshakeRow,
  ProximityBindOkResponse,
  ProximityBindIgnoredResponse,
  ProximityBindPendingResponse,
  ProximityHandshakeRequest,
  ProximityMatchUserProfile,
  ProximitySensorPayloadJson,
} from '@/types/supabase-json';
import { PENDING_HANDSHAKE_TTL_MS } from '@/types/supabase-json';

const DISPLAY_LOCATION_FALLBACK = 'A new city';
const NOMINATIM_REVERSE_TIMEOUT_MS = 3_500;
const OPEN_METEO_TIMEOUT_MS = 3_500;
const OPEN_ELEVATION_BIND_TIMEOUT_MS = 2_500;
const NOMINATIM_USER_AGENT = 'ClickPlatformsApp/1.0 (contact@click.com)';

const PENDING_HANDSHAKE_SELECT =
  'id, user_id, my_token, heard_tokens, lat, lon, lux_level, motion_variance, compass_azimuth, battery_level, sensor_payload, created_at, expires_at, matched_at';
const USER_PROFILE_SELECT = 'id, name, email, image, created_at:createdAt';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type BindResult =
  | { kind: 'ok'; status: 200; body: ProximityBindOkResponse }
  | { kind: 'pending'; status: 202; body: ProximityBindPendingResponse }
  | { kind: 'ignored'; status: 200; body: ProximityBindIgnoredResponse }
  | { kind: 'error'; status: number; body: { error: string } };

type EncounterMutationOutcome =
  | 'inserted'
  | 'debounced'
  | 'rate_limited'
  | 'insert_error'
  | 'debounce_update_error';

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
  const city = firstNonEmptyString([address.city, address.town, address.village, address.hamlet]);
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

async function fetchTerrainElevationM(lat: number, lon: number): Promise<number | null> {
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

function pendingRowToHandshakeLite(row: PendingHandshakeRow): HandshakeRowLite {
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

function sensorPayloadFromRow(row: HandshakeRowLite | null | undefined): ProximitySensorPayloadJson {
  return isRecord(row?.sensor_payload) ? (row.sensor_payload as ProximitySensorPayloadJson) : {};
}

function nonEmptyPayloadString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function buildSensorPayload(body: ProximityHandshakeRequest, timezoneOffsetMinutes: number): ProximitySensorPayloadJson {
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

export async function bindProximityHandshake(
  admin: SupabaseClient,
  uid: string,
  body: ProximityHandshakeRequest,
): Promise<BindResult> {
  const myToken = normalizeToken(body.my_token);
  if (!myToken) {
    return { kind: 'error', status: 400, body: { error: 'Invalid my_token' } };
  }

  const tokenInputs = Array.isArray(body.tokens) ? body.tokens : body.heard_tokens;
  const heardTokens = (Array.isArray(tokenInputs) ? tokenInputs : [])
    .map(normalizeToken)
    .filter((t): t is string => t != null);
  const detectedDevices = (Array.isArray(body.detected_devices) ? body.detected_devices : [])
    .map(normalizeToken)
    .filter((t): t is string => t != null);
  const combinedEvidenceTokens = [...new Set([...heardTokens, ...detectedDevices])];

  if (body.simulator_mock === true && myToken === '1234' && heardTokens.includes('5678')) {
    const connectionId = '00000000-0000-4000-8000-000000000123';
    const mockUserId = '00000000-0000-4000-8000-000000000567';
    return {
      kind: 'ok',
      status: 200,
      body: {
        success: true,
        encounter_logged: true,
        matches: [
          {
            id: mockUserId,
            name: 'Simulator Friend',
            email: 'simulator.friend@click.test',
            image: null,
            created_at: Date.now(),
            connection_id: connectionId,
            encounter_logged: true,
            is_new_connection: false,
            encounter_persisted_on_bind: true,
          },
        ],
        connection_id: connectionId,
        is_new_connection: false,
        is_group: false,
        simulator_mock: true,
        encounter_id: crypto.randomUUID(),
        collaboration_ttl: new Date(Date.now() + 86_400_000).toISOString(),
      },
    };
  }

  const lat = finiteNumber(body.gps_lat) ?? finiteNumber(body.latitude);
  const lon = finiteNumber(body.gps_lon) ?? finiteNumber(body.longitude);
  const selfLux = finiteNumber(body.lux_level);
  const selfMotion = finiteNumber(body.motion_variance);
  const selfAz = finiteNumber(body.compass_azimuth);
  const selfBattery = finiteBatteryPct(body.battery_level);
  const timezoneOffsetMinutes = finiteNumber(body.timezone_offset_minutes) ?? 0;
  const sensorPayload = buildSensorPayload(body, timezoneOffsetMinutes);
  sensorPayload.detected_devices_ble = detectedDevices;
  sensorPayload.heard_tokens_audio = heardTokens;
  const clientContextTags = sensorPayload.context_tags ?? [];
  const exactBarometricElevationM = sensorPayload.exact_barometric_elevation_m ?? null;
  const exactNoiseLevelDb = sensorPayload.exact_noise_level_db ?? null;
  const noiseLevel = sensorPayload.noise_level ?? null;
  const clientHeightCategory = sensorPayload.height_category ?? null;
  const manualLocationName = sensorPayload.location_name ?? null;
  const clientWeatherSnapshot = sensorPayload.weather_snapshot ?? null;

  const nowIso = new Date().toISOString();
  const expiresAtIso = new Date(Date.now() + PENDING_HANDSHAKE_TTL_MS).toISOString();

  await admin.from('pending_handshakes').delete().lt('expires_at', nowIso);

  await admin
    .from('pending_handshakes')
    .delete()
    .eq('user_id', uid)
    .is('matched_at', null);

  const { data: inserted, error: insErr } = await admin
    .from('pending_handshakes')
    .insert({
      user_id: uid,
      my_token: myToken,
      heard_tokens: combinedEvidenceTokens.length > 0 ? combinedEvidenceTokens : heardTokens,
      lat,
      lon,
      lux_level: selfLux,
      motion_variance: selfMotion,
      compass_azimuth: selfAz,
      battery_level: selfBattery,
      sensor_payload: sensorPayload,
      expires_at: expiresAtIso,
    })
    .select(PENDING_HANDSHAKE_SELECT)
    .single();

  if (insErr || !inserted) {
    console.error('[proximity] pending insert:', insErr);
    return { kind: 'error', status: 500, body: { error: 'Failed to record handshake' } };
  }

  const insertedRow = inserted as PendingHandshakeRow;

  if (combinedEvidenceTokens.length === 0) {
    await sleep(PROXIMITY_GROUP_COALESCE_MIN_MS);
  }

  const pendingQuery = admin
    .from('pending_handshakes')
    .select(PENDING_HANDSHAKE_SELECT)
    .gt('expires_at', nowIso)
    .is('matched_at', null);
  const { data: pendingRows, error: qErr } = await pendingQuery;

  if (qErr) {
    console.error('[proximity] pending query:', qErr);
    return { kind: 'error', status: 500, body: { error: 'Failed to load peer handshakes' } };
  }

  const rows = (pendingRows ?? []) as PendingHandshakeRow[];
  const handshakeLites = rows.map(pendingRowToHandshakeLite);
  const latestByUser = latestHandshakeRowPerUser(handshakeLites);
  const nodeRows = [...latestByUser.values()];
  const adj = buildUserAdjacency(nodeRows);
  const component = bfsComponent(uid, adj);
  const matchedIds = new Set<string>([...component].filter((id) => id !== uid));

  if (matchedIds.size === 0) {
    return {
      kind: 'pending',
      status: 202,
      body: {
        success: true,
        status: 'pending_match',
        pending_handshake_id: insertedRow.id,
        expires_at: insertedRow.expires_at,
        encounter_logged: false,
        matches: [],
      },
    };
  }

  async function lookupConnectionForMemberSet(
    memberUserIds: string[],
    createdAfterIso?: string,
  ): Promise<{ id: string; user_ids: string[]; is_group?: boolean | null; created?: number | null } | null> {
    let query = admin
      .from('connections')
      .select('id, user_ids, is_group, created')
      .contains('user_ids', memberUserIds);
    if (createdAfterIso) {
      query = query.gte('created_utc', createdAfterIso);
    }
    const { data, error } = await query;
    if (error || !data?.length) return null;
    const connRows = data as { id: string; user_ids?: string[]; is_group?: boolean | null; created?: number | null }[];
    const found = connRows.find((r) => sameMemberSet(r.user_ids, memberUserIds));
    if (!found?.id) return null;
    return { id: found.id, user_ids: found.user_ids ?? [], is_group: found.is_group, created: found.created };
  }

  const ids = [...matchedIds].sort();
  const memberIds = [uid, ...ids].sort();
  const recentLockCutoffIso = new Date(Date.now() - RECENT_CONNECTION_LOCK_MS).toISOString();
  const memberNodeRows = nodeRows.filter((row) => memberIds.includes(String(row.user_id)));
  const directTokenEvidenceForPair =
    memberNodeRows.length === 2 &&
    memberNodeRows[0] != null &&
    memberNodeRows[1] != null &&
    tokenEvidenceBetweenRows(memberNodeRows[0], memberNodeRows[1]);
  const insertedCreatedAtMs = handshakeCreatedAtMs(insertedRow);
  if (
    memberIds.length === 2 &&
    !directTokenEvidenceForPair &&
    insertedCreatedAtMs != null &&
    Date.now() - insertedCreatedAtMs < PROXIMITY_GROUP_COALESCE_MIN_MS
  ) {
    return {
      kind: 'pending',
      status: 202,
      body: {
        success: true,
        status: 'pending_match',
        pending_handshake_id: insertedRow.id,
        expires_at: insertedRow.expires_at,
        encounter_logged: false,
        matches: [],
      },
    };
  }

  if (memberIds.length >= 2) {
    const recentConnection = await lookupConnectionForMemberSet(memberIds, recentLockCutoffIso);
    if (recentConnection?.id) {
      const { data: recentUsers, error: recentUsersErr } = await admin
        .from('users')
        .select(USER_PROFILE_SELECT)
        .in('id', ids);
      if (recentUsersErr) {
        console.error('[proximity] users:', recentUsersErr);
        return { kind: 'error', status: 500, body: { error: 'Failed to load user profiles' } };
      }
      const isGroup = memberIds.length > 2;
      const matches: ProximityMatchUserProfile[] = (recentUsers ?? []).map((u: Record<string, unknown>) => ({
        id: String(u.id),
        name: (u.name as string | null | undefined) ?? null,
        email: (u.email as string | null | undefined) ?? null,
        image: (u.image as string | null | undefined) ?? null,
        created_at:
          typeof u.created_at === 'string'
            ? Date.parse(u.created_at)
            : typeof u.created_at === 'number'
              ? u.created_at
              : 0,
        connection_id: String(recentConnection.id),
        encounter_logged: true,
        is_new_connection: false,
        encounter_persisted_on_bind: true,
      }));

      await markPendingHandshakesMatched(admin, memberIds, nowIso);

      return {
        kind: 'ok',
        status: 200,
        body: {
          success: true,
          encounter_logged: true,
          matches,
          connection_id: String(recentConnection.id),
          is_new_connection: false,
          is_group: isGroup,
          ...(isGroup ? { group_clique_candidate: { member_user_ids: memberIds } } : {}),
        },
      };
    }
  }

  const encLat = lat != null && lon != null && !(lat === 0 && lon === 0) ? lat : null;
  const encLon = lat != null && lon != null && !(lat === 0 && lon === 0) ? lon : null;

  async function scheduleEncounterGeoEnrichment(
    connectionId: string,
    reportingUserId: string,
    memberLat: number | null,
    memberLon: number | null,
    memberExactBarometricElevationM: number | null,
    manualLocationName: string | null,
    clientWeatherSnapshot: string | null,
  ): Promise<void> {
    if (memberLat == null || memberLon == null) return;

    const { data: latestEnc, error: encLookupErr } = await admin
      .from('connection_encounters')
      .select('id')
      .eq('connection_id', connectionId)
      .eq('reporting_user_id', reportingUserId)
      .order('encountered_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (encLookupErr || !latestEnc?.id) {
      if (encLookupErr) console.warn('[proximity] encounter enrichment lookup:', encLookupErr.message);
      return;
    }

    const updates: Record<string, unknown> = {};
    const geocoded = await fetchNominatimReverseGeocode(memberLat, memberLon);
    updates.display_location = geocoded.displayLocation;
    if (geocoded.semanticLocation != null) updates.semantic_location = geocoded.semanticLocation;
    const locationName = manualLocationName ?? geocoded.specificLocationName;
    if (locationName) updates.location_name = locationName;

    if (clientWeatherSnapshot == null) {
      const weather = await fetchOpenMeteoWeatherSnapshot(memberLat, memberLon);
      if (weather != null) updates.weather_snapshot = weather;
    }

    if (memberExactBarometricElevationM != null) {
      const terrainM = await fetchTerrainElevationM(memberLat, memberLon);
      if (terrainM != null) {
        updates.relative_altitude_m = memberExactBarometricElevationM - terrainM;
      }
    }

    if (Object.keys(updates).length === 0) return;

    const { error } = await admin.from('connection_encounters').update(updates).eq('id', latestEnc.id);
    if (error) {
      console.warn('[proximity] encounter enrichment update:', error.message);
    }
  }

  function fireEncounterGeoEnrichment(
    connectionId: string,
    memberId: string,
    memberLat: number | null,
    memberLon: number | null,
    memberExactBarometricElevationM: number | null,
    manualLocationName: string | null,
    clientWeatherSnapshot: string | null,
  ): void {
    void scheduleEncounterGeoEnrichment(
      connectionId,
      memberId,
      memberLat,
      memberLon,
      memberExactBarometricElevationM,
      manualLocationName,
      clientWeatherSnapshot,
    ).catch((error) => {
      console.warn('[proximity] encounter enrichment failed:', error);
    });
  }

  async function ensureConnectionForMemberSet(
    memberUserIds: string[],
    options?: { forceActive?: boolean },
  ): Promise<{ connectionId: string; isNewConnection: boolean; isGroup: boolean } | null> {
    const members = [...new Set(memberUserIds)].sort();
    const forceActive = options?.forceActive === true || members.length > 2;
    const existing = await lookupConnectionForMemberSet(members);
    if (existing?.id) {
      if (forceActive) {
        const { error: promoteErr } = await admin
          .from('connections')
          .update({ status: 'active', expiry_state: 'active' })
          .eq('id', existing.id)
          .eq('status', 'pending');
        if (promoteErr) {
          console.warn('[proximity] ensureConnection promote active:', promoteErr.message);
        }
      }
      return { connectionId: String(existing.id), isNewConnection: false, isGroup: members.length > 2 };
    }
    const nowMs = Date.now();
    const expiryMs = nowMs + 30 * 24 * 60 * 60 * 1000;
    const hasGps = encLat != null && encLon != null;
    const proximityConfidence = hasGps ? 65 : 50;
    const insertRow: Record<string, unknown> = {
      user_ids: members,
      created: nowMs,
      expiry: expiryMs,
      should_continue: members.map(() => false),
      has_begun: false,
      expiry_state: forceActive ? 'active' : 'pending',
      status: forceActive ? 'active' : 'pending',
      include_in_business_insights: true,
      initiator_id: uid,
      responder_id: uid,
      connection_method: 'proximity',
      proximity_confidence: proximityConfidence,
      flagged: proximityConfidence < 20,
      proximity_signals: {
        connection_method: 'proximity',
        gps_available: hasGps,
        bind_source: 'api-connections-proximity',
      },
      created_utc: new Date(nowMs).toISOString(),
      time_of_day_utc: utcTimeOfDayLabelFromMs(nowMs),
      is_group: members.length > 2,
    };
    const { data: ins, error: connInsErr } = await admin.from('connections').insert(insertRow).select('id').single();
    if (connInsErr || !ins?.id) {
      if (isDuplicateKeyError(connInsErr)) {
        const retry = await lookupConnectionForMemberSet(members);
        if (retry?.id) {
          if (forceActive) {
            await admin
              .from('connections')
              .update({ status: 'active', expiry_state: 'active' })
              .eq('id', retry.id)
              .eq('status', 'pending');
          }
          return { connectionId: String(retry.id), isNewConnection: false, isGroup: members.length > 2 };
        }
      }
      console.error('[proximity] ensureConnection insert:', connInsErr);
      return null;
    }
    const connectionId = String(ins.id);
    const { error: chatErr } = await admin.from('chats').insert({
      connection_id: connectionId,
      created_at: nowMs,
      updated_at: nowMs,
    });
    if (chatErr && !isDuplicateKeyError(chatErr)) {
      console.warn('[proximity] ensureConnection chat:', chatErr.message);
    }
    return { connectionId, isNewConnection: true, isGroup: members.length > 2 };
  }

  function memberSensorValues(memberId: string): {
    row: HandshakeRowLite | null;
    payload: ProximitySensorPayloadJson;
    lat: number | null;
    lon: number | null;
    lux: number | null;
    motion: number | null;
    azimuth: number | null;
    battery: number | null;
    exactNoiseLevelDb: number | null;
    noiseLevel: string | null;
    exactBarometricElevationM: number | null;
    heightCategory: string | null;
    manualLocationName: string | null;
    weatherSnapshot: string | null;
    contextTags: string[];
  } {
    const row =
      memberId === uid
        ? pendingRowToHandshakeLite(insertedRow)
        : latestByUser.get(memberId) ?? null;
    const payload = sensorPayloadFromRow(row);
    const latValue = memberId === uid ? encLat : finiteNumber(row?.lat);
    const lonValue = memberId === uid ? encLon : finiteNumber(row?.lon);
    return {
      row,
      payload,
      lat: latValue != null && lonValue != null && !(latValue === 0 && lonValue === 0) ? latValue : null,
      lon: latValue != null && lonValue != null && !(latValue === 0 && lonValue === 0) ? lonValue : null,
      lux: memberId === uid ? selfLux : finiteNumber(row?.lux_level),
      motion: memberId === uid ? selfMotion : finiteNumber(row?.motion_variance),
      azimuth: memberId === uid ? selfAz : finiteNumber(row?.compass_azimuth),
      battery: memberId === uid ? selfBattery : finiteBatteryPct(row?.battery_level),
      exactNoiseLevelDb: memberId === uid ? exactNoiseLevelDb : finiteNumber(payload.exact_noise_level_db),
      noiseLevel: memberId === uid ? noiseLevel : nonEmptyPayloadString(payload.noise_level),
      exactBarometricElevationM:
        memberId === uid ? exactBarometricElevationM : finiteNumber(payload.exact_barometric_elevation_m),
      heightCategory: memberId === uid ? clientHeightCategory : nonEmptyPayloadString(payload.height_category),
      manualLocationName: memberId === uid ? manualLocationName : nonEmptyPayloadString(payload.location_name),
      weatherSnapshot: memberId === uid ? clientWeatherSnapshot : nonEmptyPayloadString(payload.weather_snapshot),
      contextTags: normalizeContextTagsArray(payload.context_tags),
    };
  }

  const encounterMemberTemplateCache = new Map<
    string,
    { row: Record<string, unknown>; lat: number | null; lon: number | null }
  >();

  async function buildEncounterRowForMember(
    connectionId: string,
    memberId: string,
    encounteredAtIso: string,
  ): Promise<{ row: Record<string, unknown>; lat: number | null; lon: number | null }> {
    const cacheKey = `${memberId}|${encounteredAtIso}`;
    const cached = encounterMemberTemplateCache.get(cacheKey);
    if (cached) {
      return {
        row: { ...cached.row, connection_id: connectionId },
        lat: cached.lat,
        lon: cached.lon,
      };
    }
    const values = memberSensorValues(memberId);
    const otherRows = memberIds
      .filter((id) => id !== memberId)
      .map((id) => memberSensorValues(id));
    const avg = (nums: Array<number | null>) => {
      const finite = nums.filter((v): v is number => v != null);
      return finite.length ? finite.reduce((a, b) => a + b, 0) / finite.length : null;
    };
    const memberVibeTags = buildVibeContextTags({
      lux: values.lux,
      selfMotion: values.motion,
      peerMotion: avg(otherRows.map((row) => row.motion)),
      selfAz: values.azimuth,
      peerAz: avg(otherRows.map((row) => row.azimuth)),
      battery: values.battery,
    });
    const memberContextTags = mergeContextTagLists(
      mergeContextTagLists(clientContextTags, values.contextTags),
      memberVibeTags,
    );

    let memberRelativeAltitudeM: number | null = null;
    const memberDisplayLocation = DISPLAY_LOCATION_FALLBACK;
    const memberSpecificLocationName: string | null = null;
    const memberSemanticLocation: Record<string, unknown> | null = null;

    const row: Record<string, unknown> = {
      connection_id: connectionId,
      encountered_at: encounteredAtIso,
      context_tags: memberContextTags,
      display_location: memberDisplayLocation,
      reporting_user_id: memberId,
    };
    const locationName = values.manualLocationName ?? memberSpecificLocationName;
    if (locationName) row.location_name = locationName;
    if (values.lat != null && values.lon != null) {
      row.gps_lat = values.lat;
      row.gps_lon = values.lon;
    }
    if (memberSemanticLocation != null) row.semantic_location = memberSemanticLocation;
    if (values.noiseLevel != null) row.noise_level = values.noiseLevel;
    if (values.exactNoiseLevelDb != null) row.exact_noise_level_db = values.exactNoiseLevelDb;
    if (values.exactBarometricElevationM != null) row.exact_barometric_elevation_m = values.exactBarometricElevationM;
    if (values.heightCategory != null) row.elevation_category = values.heightCategory;
    if (memberRelativeAltitudeM != null) row.relative_altitude_m = memberRelativeAltitudeM;
    if (values.lux != null) row.lux_level = values.lux;
    if (values.motion != null) row.motion_variance = values.motion;
    if (values.azimuth != null) row.compass_azimuth = values.azimuth;
    if (values.battery != null) row.battery_level = values.battery;

    if (values.weatherSnapshot != null) row.weather_snapshot = values.weatherSnapshot;

    const templateRow = { ...row };
    delete templateRow.connection_id;
    encounterMemberTemplateCache.set(cacheKey, { row: templateRow, lat: values.lat, lon: values.lon });
    return { row, lat: values.lat, lon: values.lon };
  }

  async function insertOrDebounceEncounter(
    connectionId: string,
    insertRow: Record<string, unknown>,
    encounterLat: number | null,
    encounterLon: number | null,
    reportingUserId?: string | null,
  ): Promise<EncounterMutationOutcome> {
    if (reportingUserId) {
      insertRow.reporting_user_id = reportingUserId;
    }
    const encounteredAtIso = String(insertRow.encountered_at ?? '');
    const newBlock = twelveHourUtcBlockId(encounteredAtIso);
    if (encounterLat == null || encounterLon == null || newBlock == null) {
      const { error: encErr } = await admin.from('connection_encounters').insert(insertRow);
      if (encErr) {
        if (isEncounterRateLimitError(encErr)) {
          await admin.from('chats').update({ updated_at: Date.now() }).eq('connection_id', connectionId);
          return 'rate_limited';
        }
        console.warn('[proximity] encounter:', encErr.message);
        return 'insert_error';
      }
      return 'inserted';
    }

    let lastEncounterQuery = admin
      .from('connection_encounters')
      .select('id, gps_lat, gps_lon, encountered_at, context_tags')
      .eq('connection_id', connectionId);
    if (reportingUserId) {
      lastEncounterQuery = lastEncounterQuery.eq('reporting_user_id', reportingUserId);
    }
    const { data: lastRow, error: lastErr } = await lastEncounterQuery
      .order('encountered_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastErr) {
      console.warn('[proximity] last encounter:', lastErr.message);
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
      haversineMeters(encounterLat, encounterLon, lastLat, lastLon) <= ENCOUNTER_DEBOUNCE_MAX_M;

    if (canDebounce && last.id) {
      const prevTags = Array.isArray(last.context_tags) ? [...last.context_tags] : [];
      const merged = [...new Set([...prevTags, EXTENDED_HANGOUT_TAG])];
      const { error: upErr } = await admin
        .from('connection_encounters')
        .update({ context_tags: merged })
        .eq('id', last.id);
      if (upErr) {
        console.warn('[proximity] encounter debounce update:', upErr.message);
        return 'debounce_update_error';
      }
      return 'debounced';
    }

    const { error: encErr } = await admin.from('connection_encounters').insert(insertRow);
    if (encErr) {
      if (isEncounterRateLimitError(encErr)) {
        await admin.from('chats').update({ updated_at: Date.now() }).eq('connection_id', connectionId);
        return 'rate_limited';
      }
      console.warn('[proximity] encounter:', encErr.message);
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
  let handshakeCreatedNewConnection = false;
  let aggregateConnectionId: string | null = null;

  const ensured = await ensureConnectionForMemberSet(memberIds);
  if (!ensured) {
    // Leave pending_handshakes unmatched so GET recovery can retry instead of 404.
    return {
      kind: 'error',
      status: 503,
      body: {
        error: 'connection_unavailable',
        pending_handshake_id: insertedRow.id,
        expires_at: insertedRow.expires_at,
      },
    };
  }

  {
    const { connectionId, isNewConnection } = ensured;
    aggregateConnectionId = connectionId;
    handshakeCreatedNewConnection = isNewConnection;
    const encounteredAtIso = new Date().toISOString();
    let outcome: EncounterMutationOutcome = 'inserted';
    for (const memberId of memberIds) {
      const { row: memberRow, lat: memberLat, lon: memberLon } = await buildEncounterRowForMember(
        connectionId,
        memberId,
        encounteredAtIso,
      );
      const memberOutcome = await insertOrDebounceEncounter(
        connectionId,
        memberRow,
        memberLat,
        memberLon,
        memberId,
      );
      if (memberOutcome === 'inserted' || memberOutcome === 'debounced') {
        const values = memberSensorValues(memberId);
        fireEncounterGeoEnrichment(
          connectionId,
          memberId,
          memberLat,
          memberLon,
          values.exactBarometricElevationM,
          values.manualLocationName,
          values.weatherSnapshot,
        );
      }
      if (memberId === uid) {
        outcome = memberOutcome;
      }
    }
    const directPeerConnectionIds = new Map<string, string>();
    if (memberIds.length > 2) {
      for (let i = 0; i < memberIds.length; i += 1) {
        for (let j = i + 1; j < memberIds.length; j += 1) {
          const pair = [memberIds[i]!, memberIds[j]!].sort();
          const pairEnsured = await ensureConnectionForMemberSet(pair, { forceActive: true });
          if (!pairEnsured) {
            console.warn('[proximity] pairwise clique connection unavailable:', pair.join(','));
            return {
              kind: 'error',
              status: 503,
              body: {
                error: 'pairwise_connection_unavailable',
                pending_handshake_id: insertedRow.id,
                pair,
              },
            };
          }
          if (pair.includes(uid)) {
            const peerId = pair.find((id) => id !== uid);
            if (peerId) directPeerConnectionIds.set(peerId, pairEnsured.connectionId);
          }
          for (const pairMemberId of pair) {
            const { row: pairMemberRow, lat: pairMemberLat, lon: pairMemberLon } = await buildEncounterRowForMember(
              pairEnsured.connectionId,
              pairMemberId,
              encounteredAtIso,
            );
            await insertOrDebounceEncounter(
              pairEnsured.connectionId,
              pairMemberRow,
              pairMemberLat,
              pairMemberLon,
              pairMemberId,
            );
            const pairValues = memberSensorValues(pairMemberId);
            fireEncounterGeoEnrichment(
              pairEnsured.connectionId,
              pairMemberId,
              pairMemberLat,
              pairMemberLon,
              pairValues.exactBarometricElevationM,
              pairValues.manualLocationName,
              pairValues.weatherSnapshot,
            );
          }
        }
      }
    }
    const persisted = outcome === 'inserted' || outcome === 'debounced';
    ids.forEach((peerId) => {
      const responseConnectionId = directPeerConnectionIds.get(peerId) ?? connectionId;
      if (outcome === 'rate_limited') {
        peerEncounterLogged.push({
          peerId,
          connectionId: responseConnectionId,
          encounterLogged: false,
          isNewConnection,
          encounterPersistedOnBind: false,
          reason: 'rate_limit_active',
        });
      } else {
        peerEncounterLogged.push({
          peerId,
          connectionId: responseConnectionId,
          encounterLogged: true,
          isNewConnection,
          encounterPersistedOnBind: persisted,
          ...(outcome === 'insert_error' || outcome === 'debounce_update_error'
            ? { reason: 'encounter_mutation_failed' as const }
            : {}),
        });
      }
    });
  }

  await markPendingHandshakesMatched(admin, memberIds, nowIso);

  const aggregateEncounterLogged = peerEncounterLogged.some((p) => p.encounterLogged);

  const { data: users, error: uErr } = await admin
    .from('users')
    .select(USER_PROFILE_SELECT)
    .in('id', ids);

  if (uErr) {
    console.error('[proximity] users:', uErr);
    return { kind: 'error', status: 500, body: { error: 'Failed to load user profiles' } };
  }

  const metaByPeer = new Map(peerEncounterLogged.map((p) => [p.peerId, p]));

  const matches: ProximityMatchUserProfile[] = (users ?? []).map((u: Record<string, unknown>) => {
    const id = String(u.id);
    const meta = metaByPeer.get(id);
    const encounter_logged = meta?.encounterLogged ?? true;
    return {
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
      is_new_connection: meta != null ? meta.isNewConnection : false,
      encounter_persisted_on_bind: meta?.encounterPersistedOnBind ?? false,
      ...(meta?.reason ? { reason: meta.reason } : {}),
    };
  });

  const responseBody: ProximityBindOkResponse = {
    success: true,
    encounter_logged: aggregateEncounterLogged,
    matches,
  };
  const sharedConnectionId = aggregateConnectionId ?? peerEncounterLogged.find((p) => p.connectionId != null)?.connectionId ?? null;
  if (sharedConnectionId != null) {
    responseBody.connection_id = sharedConnectionId;
    responseBody.is_new_connection = handshakeCreatedNewConnection;
    responseBody.is_group = memberIds.length > 2;
  }
  if (memberIds.length > 2) {
    responseBody.group_clique_candidate = { member_user_ids: memberIds };
  }
  if (matches.length === 1 && responseBody.connection_id == null) {
    const only = matches[0];
    if (only?.connection_id != null) {
      responseBody.connection_id = only.connection_id;
      responseBody.is_new_connection = only.is_new_connection;
      responseBody.is_group = false;
    }
  }

  if (sharedConnectionId != null) {
    const participantIds = [...new Set([uid, ...memberIds])].sort();
    const collab = await createCollaborationSessionForConnection(
      admin,
      sharedConnectionId,
      participantIds,
      timezoneOffsetMinutes,
    );
    if (collab) {
      responseBody.encounter_id = collab.encounterId;
      responseBody.collaboration_ttl = collab.collaborationTtl;
    }
  }

  return { kind: 'ok', status: 200, body: responseBody };
}

async function markPendingHandshakesMatched(
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