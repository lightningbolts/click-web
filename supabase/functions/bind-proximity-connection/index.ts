/**
 * Edge Function: bind-proximity-connection
 *
 * POST JSON { my_token, tokens[], heard_tokens[], latitude?, longitude?, gps_lat?, gps_lon?,
 *   exact_barometric_elevation_m?, noise_level?, exact_noise_level_db?, context_tags?, height_category?,
 *   lux_level?, motion_variance?, compass_azimuth?, battery_level?, client_context_first? (ignored),
 *   simulator_mock? }
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
import {
  corsHeaders,
  CLEANUP_GRACE_MS,
  MATCH_TIME_WINDOW_MS,
  RECENT_CONNECTION_LOCK_MS,
  ENCOUNTER_DEBOUNCE_MAX_M,
  EXTENDED_HANGOUT_TAG,
  DISPLAY_LOCATION_FALLBACK,
  UserProfile,
  EncounterMutationOutcome,
  computeCollaborationTtl,
  haversineMeters,
  normalizeToken,
  HandshakeRowLite,
  latestHandshakeRowPerUser,
  buildUserAdjacency,
  bfsComponent,
  twelveHourUtcBlockId,
  finiteNumber,
  finiteBatteryPct,
  utcTimeOfDayLabelFromMs,
  isDuplicateKeyError,
  isEncounterRateLimitError,
  normalizeContextTagsArray,
  mergeContextTagLists,
  fetchOpenMeteoWeatherSnapshot,
  fetchOpenMeteoForecast,
  fetchNominatimReverseGeocode,
  buildVibeContextTags,
  deriveHeightCategoryFromRelativeAltitudeM,
} from './bindSupport.ts';

const APPROVED_SIMULATOR_ENVIRONMENTS = new Set(['development', 'test', 'staging']);

function simulatorMockIsEnabled(): boolean {
  const enabled = Deno.env.get('CLICK_ENABLE_SIMULATOR_MOCK') === 'true';
  const appEnvironment = (Deno.env.get('CLICK_APP_ENV') ?? '').trim().toLowerCase();
  return (
    enabled &&
    Deno.env.get('CLICK_APP_ENV') !== 'production' &&
    APPROVED_SIMULATOR_ENVIRONMENTS.has(appEnvironment)
  );
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
    tokens?: unknown[];
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
    simulator_mock?: unknown;
    timezone_offset_minutes?: unknown;
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

  const tokenInputs = Array.isArray(body.tokens) ? body.tokens : body.heard_tokens;
  const heardTokens = (Array.isArray(tokenInputs) ? tokenInputs : [])
    .map(normalizeToken)
    .filter((t): t is string => t != null);

  // Test-only fixtures must be explicitly enabled by a non-production deployment.
  // Never infer this from a client-supplied field: production clients are untrusted.
  const simulatorMockEnabled = simulatorMockIsEnabled();
  if (
    body.simulator_mock === true &&
    simulatorMockEnabled &&
    myToken === '1234' &&
    heardTokens.includes('5678')
  ) {
    const connectionId = '00000000-0000-4000-8000-000000000123';
    const mockUserId = '00000000-0000-4000-8000-000000000567';
    const mockUser: UserProfile = {
      id: mockUserId,
      name: 'Simulator Friend',
      email: 'simulator.friend@click.test',
      image: null,
      created_at: Date.now(),
      connection_id: connectionId,
      encounter_logged: true,
      is_new_connection: false,
      encounter_persisted_on_bind: true,
    };
    const mockTtl = computeCollaborationTtl(0);
    const mockEncounterId = crypto.randomUUID();
    return new Response(
      JSON.stringify({
        success: true,
        encounter_logged: true,
        matches: [mockUser],
        connection_id: connectionId,
        is_new_connection: false,
        is_group: false,
        simulator_mock: true,
        encounter_id: mockEncounterId,
        collaboration_ttl: mockTtl,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

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
  const timezoneOffsetMinutes = finiteNumber(body.timezone_offset_minutes) ?? 0;

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

  const ids = [...matchedIds].sort();
  const memberIds = [uid, ...ids].sort();
  const recentLockCutoffIso = new Date(Date.now() - RECENT_CONNECTION_LOCK_MS).toISOString();
  if (memberIds.length > 2) {
    const recentConnection = await lookupConnectionForMemberSet(memberIds, recentLockCutoffIso);
    if (recentConnection?.id) {
      const { data: recentUsers, error: recentUsersErr } = await admin
        .from('users')
        .select('id, name, email, image, created_at')
        .in('id', ids);
      if (recentUsersErr) {
        console.error('bind-proximity-connection users:', recentUsersErr);
        return new Response(JSON.stringify({ error: 'Failed to load user profiles' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const matches: UserProfile[] = (recentUsers ?? []).map((u: Record<string, unknown>) => ({
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
      return new Response(
        JSON.stringify({
          success: true,
          encounter_logged: true,
          matches,
          connection_id: String(recentConnection.id),
          is_new_connection: false,
          is_group: true,
          group_clique_candidate: { member_user_ids: memberIds },
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
  }

  const encLat =
    lat != null && lon != null && !(lat === 0 && lon === 0) ? lat : null;
  const encLon =
    lat != null && lon != null && !(lat === 0 && lon === 0) ? lon : null;

  let relativeAltitudeM: number | null = null;
  let semanticLocation: Record<string, unknown> | null = null;
  let displayLocation = DISPLAY_LOCATION_FALLBACK;
  let specificLocationName: string | null = null;
  let openMeteoForecast: { weatherSnapshot: string | null; elevationM: number | null } | null = null;

  if (encLat != null && encLon != null) {
    openMeteoForecast = await fetchOpenMeteoForecast(encLat, encLon);
    if (exactBarometricElevationM != null && openMeteoForecast.elevationM != null) {
      relativeAltitudeM = exactBarometricElevationM - openMeteoForecast.elevationM;
    }
    const geocoded = await fetchNominatimReverseGeocode(encLat, encLon);
    semanticLocation = geocoded.semanticLocation;
    displayLocation = geocoded.displayLocation;
    specificLocationName = geocoded.specificLocationName;
  }
  const resolvedLocationName = manualLocationName ?? specificLocationName;

  function sameMemberSet(a: string[] | undefined | null, b: string[]): boolean {
    const aa = [...new Set(a ?? [])].sort();
    const bb = [...new Set(b)].sort();
    return aa.length === bb.length && aa.every((x, i) => x === bb[i]);
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
    const rows = data as { id: string; user_ids?: string[]; is_group?: boolean | null; created?: number | null }[];
    return rows.find((r) => sameMemberSet(r.user_ids, memberUserIds)) ?? null;
  }

  async function ensureConnectionForMemberSet(
    memberUserIds: string[],
  ): Promise<{ connectionId: string; isNewConnection: boolean; isGroup: boolean } | null> {
    const members = [...new Set(memberUserIds)].sort();
    const existing = await lookupConnectionForMemberSet(members);
    if (existing?.id) {
      return { connectionId: String(existing.id), isNewConnection: false, isGroup: members.length > 2 };
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
      user_ids: members,
      created: nowMs,
      expiry: expiryMs,
      should_continue: members.map(() => false),
      has_begun: false,
      expiry_state: members.length > 2 ? 'active' : 'pending',
      status: members.length > 2 ? 'active' : 'pending',
      include_in_business_insights: true,
      initiator_id: uid,
      responder_id: uid,
      connection_method: 'proximity',
      proximity_confidence: proximityConfidence,
      flagged: proximityConfidence < 20,
      proximity_signals: proximitySignals,
      created_utc: new Date(nowMs).toISOString(),
      time_of_day_utc: utcTimeOfDayLabelFromMs(nowMs),
      is_group: members.length > 2,
    };
    const { data: ins, error: insErr } = await admin.from('connections').insert(insertRow).select('id').single();
    if (insErr || !ins?.id) {
      if (isDuplicateKeyError(insErr)) {
        const retry = await lookupConnectionForMemberSet(members);
        if (retry?.id) return { connectionId: String(retry.id), isNewConnection: false, isGroup: members.length > 2 };
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
    return { connectionId, isNewConnection: true, isGroup: members.length > 2 };
  }

  function memberGpsFromHandshake(
    memberId: string,
    bindingUserId: string,
    bindingLat: number | null,
    bindingLon: number | null,
    latestByUser: Map<string, HandshakeRowLite>,
  ): { lat: number | null; lon: number | null } {
    if (memberId === bindingUserId) {
      return { lat: bindingLat, lon: bindingLon };
    }
    const row = latestByUser.get(memberId);
    return { lat: finiteNumber(row?.lat), lon: finiteNumber(row?.lon) };
  }

  async function insertOrDebounceEncounter(
    connectionId: string,
    insertRow: Record<string, unknown>,
    encLat: number | null,
    encLon: number | null,
    reportingUserId?: string | null,
  ): Promise<EncounterMutationOutcome> {
    if (reportingUserId) {
      insertRow.reporting_user_id = reportingUserId;
    }
    const encounteredAtIso = String(insertRow.encountered_at ?? '');
    const newBlock = twelveHourUtcBlockId(encounteredAtIso);
    if (encLat == null || encLon == null || newBlock == null) {
      const { error: encErr } = await admin.from('connection_encounters').insert(insertRow);
      if (encErr) {
        if (isEncounterRateLimitError(encErr)) {
          const nowMs = Date.now();
          await admin.from('chats').update({ updated_at: nowMs }).eq('connection_id', connectionId);
          return 'rate_limited';
        }
        console.warn('bind-proximity-connection encounter:', encErr.message);
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
      if (isEncounterRateLimitError(encErr)) {
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
  /** True only when this bind created a new row in `connections` (strict server boolean for clients). */
  let handshakeCreatedNewConnection = false;
  const ensured = await ensureConnectionForMemberSet(memberIds);
  if (!ensured) {
    ids.forEach((peerId) => {
      peerEncounterLogged.push({
        peerId,
        connectionId: null,
        encounterLogged: false,
        isNewConnection: false,
        encounterPersistedOnBind: false,
        reason: 'connection_unavailable',
      });
    });
  } else {
    const { connectionId, isNewConnection } = ensured;
    handshakeCreatedNewConnection = isNewConnection;
    const peerRows = ids
      .map((peerId) => rows.find((r) => r && String(r.user_id) === peerId) as Record<string, unknown> | undefined)
      .filter((r): r is Record<string, unknown> => r != null);
    const peerMotionValues = peerRows.map((r) => finiteNumber(r.motion_variance)).filter((v): v is number => v != null);
    const peerAzValues = peerRows.map((r) => finiteNumber(r.compass_azimuth)).filter((v): v is number => v != null);
    const avg = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);
    const vibeTags = buildVibeContextTags({
      lux: selfLux,
      selfMotion,
      peerMotion: avg(peerMotionValues),
      selfAz,
      peerAz: avg(peerAzValues),
      battery: selfBattery,
    });
    const mergedContextTags = mergeContextTagLists(clientContextTags, vibeTags);
    const encounteredAtIso = new Date().toISOString();
    const bindingInsertRow: Record<string, unknown> = {
      connection_id: connectionId,
      encountered_at: encounteredAtIso,
      context_tags: mergedContextTags,
      display_location: displayLocation,
      reporting_user_id: uid,
    };
    if (resolvedLocationName) bindingInsertRow.location_name = resolvedLocationName;
    if (encLat != null && encLon != null) {
      bindingInsertRow.gps_lat = encLat;
      bindingInsertRow.gps_lon = encLon;
    }
    if (semanticLocation != null) bindingInsertRow.semantic_location = semanticLocation;
    if (noiseLevel != null) bindingInsertRow.noise_level = noiseLevel;
    if (exactNoiseLevelDb != null) bindingInsertRow.exact_noise_level_db = exactNoiseLevelDb;
    if (exactBarometricElevationM != null) bindingInsertRow.exact_barometric_elevation_m = exactBarometricElevationM;
    if (relativeAltitudeM != null) {
      bindingInsertRow.relative_altitude_m = relativeAltitudeM;
      const aglCategory = deriveHeightCategoryFromRelativeAltitudeM(relativeAltitudeM);
      if (aglCategory != null) bindingInsertRow.elevation_category = aglCategory;
    }
    // Do not persist client AMSL-derived height_category when AGL is unknown.
    if (selfLux != null) bindingInsertRow.lux_level = selfLux;
    if (selfMotion != null) bindingInsertRow.motion_variance = selfMotion;
    if (selfAz != null) bindingInsertRow.compass_azimuth = selfAz;
    if (selfBattery != null) bindingInsertRow.battery_level = selfBattery;

    let resolvedWeather = clientWeatherSnapshot;
    if (resolvedWeather == null && openMeteoForecast?.weatherSnapshot != null) {
      resolvedWeather = openMeteoForecast.weatherSnapshot;
    }
    if (resolvedWeather == null && encLat != null && encLon != null) {
      resolvedWeather = await fetchOpenMeteoWeatherSnapshot(encLat, encLon);
    }
    if (resolvedWeather != null) bindingInsertRow.weather_snapshot = resolvedWeather;

    // Lossless spatial telemetry: one row per matched member with their individual handshake GPS.
    // Never average coordinates — centroid snapping happens client-side on the B2B map.
    let outcome: EncounterMutationOutcome = 'inserted';
    for (const memberId of memberIds) {
      const { lat: memberLat, lon: memberLon } = memberGpsFromHandshake(
        memberId,
        uid,
        encLat,
        encLon,
        latestByUser,
      );
      const memberRow: Record<string, unknown> =
        memberId === uid
          ? { ...bindingInsertRow }
          : {
              connection_id: connectionId,
              encountered_at: encounteredAtIso,
              context_tags: mergedContextTags,
              display_location: displayLocation,
              reporting_user_id: memberId,
            };
      if (memberLat != null && memberLon != null && !(memberLat === 0 && memberLon === 0)) {
        memberRow.gps_lat = memberLat;
        memberRow.gps_lon = memberLon;
      }
      const memberOutcome = await insertOrDebounceEncounter(
        connectionId,
        memberRow,
        memberLat,
        memberLon,
        memberId,
      );
      if (memberId === uid) {
        outcome = memberOutcome;
      }
    }
    const persisted = outcome === 'inserted' || outcome === 'debounced';
    ids.forEach((peerId) => {
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
    });
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
      is_new_connection: meta != null ? meta.isNewConnection : false,
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
  const sharedConnectionId = peerEncounterLogged.find((p) => p.connectionId != null)?.connectionId ?? null;
  if (sharedConnectionId != null) {
    responseBody.connection_id = sharedConnectionId;
    responseBody.is_new_connection = handshakeCreatedNewConnection;
    responseBody.is_group = memberIds.length > 2;
  }
  if (memberIds.length > 2) {
    responseBody.group_clique_candidate = {
      member_user_ids: memberIds,
    };
  }
  if (matches.length === 1 && responseBody.connection_id == null) {
    const only = matches[0];
    if (only?.connection_id != null) {
      responseBody.connection_id = only.connection_id;
      responseBody.is_new_connection = only.is_new_connection;
      responseBody.is_group = false;
    }
  }

  // Re-engagement: existing friends unlock Disposable Roll + Squad map drops.
  if (sharedConnectionId != null) {
    const collaborationTtl = computeCollaborationTtl(timezoneOffsetMinutes);
    const participantIds = [...new Set([uid, ...memberIds])].sort();
    let chatId: string | null = null;
    const { data: chatRow } = await admin
      .from('chats')
      .select('id')
      .eq('connection_id', sharedConnectionId)
      .maybeSingle();
    if (chatRow?.id) chatId = String(chatRow.id);

    const encounterId = crypto.randomUUID();
    const { error: collabErr } = await admin.from('collaboration_sessions').insert({
      id: encounterId,
      connection_id: sharedConnectionId,
      chat_id: chatId,
      collaboration_ttl: collaborationTtl,
      participant_user_ids: participantIds,
      notification_sent: false,
    });
    if (collabErr) {
      console.warn('bind-proximity-connection collaboration_session:', collabErr.message);
    } else {
      responseBody.encounter_id = encounterId;
      responseBody.collaboration_ttl = collaborationTtl;
    }
  }

  return new Response(JSON.stringify(responseBody), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
