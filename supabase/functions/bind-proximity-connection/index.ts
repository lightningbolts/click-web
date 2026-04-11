/**
 * Edge Function: bind-proximity-connection
 *
 * POST JSON { my_token, heard_tokens[], latitude?, longitude?, gps_lat?, gps_lon?,
 *   exact_barometric_elevation_m?, noise_level?, exact_noise_level_db? }
 * Authorization: Bearer <user JWT>
 *
 * Inserts this device's handshake, then returns other users whose pings overlap in time,
 * distance (≤15m when both have GPS), and token evidence (mutual hear or heard_tokens intersect).
 *
 * Ghost taps: unmatched handshake rows are kept up to ~5 minutes so a delayed peer ping can match.
 * Encounter debouncing: new crossings within 50m and the same 12-hour UTC block append "Extended Hangout"
 * to the latest encounter instead of inserting a duplicate row.
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

type UserProfile = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  created_at: number;
  connection_id: string | null;
  encounter_logged: boolean;
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

function twelveHourUtcBlockId(iso: string): number | null {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  return Math.floor(ms / TWELVE_HOURS_MS);
}

function finiteNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * Terrain elevation (m above sea level) at a point from Open-Elevation (SRTM-backed DEM).
 */
async function fetchTerrainElevationM(lat: number, lon: number): Promise<number | null> {
  const url = `https://api.open-elevation.com/api/v1/lookup?locations=${lat},${lon}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
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
    .select('id, user_id, my_token, heard_tokens, lat, lon, created_at')
    .gte('created_at', windowStart);

  if (qErr) {
    console.error('bind-proximity-connection query:', qErr);
    return new Response(JSON.stringify({ error: 'Failed to load peer handshakes' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const rows = recent ?? [];
  const matchedIds = new Set<string>();

  for (const o of rows) {
    if (!o || o.user_id === uid) continue;
    const ot = Date.parse(String(o.created_at));
    if (!Number.isFinite(ot) || Math.abs(ot - t0) > MATCH_TIME_WINDOW_MS) continue;

    const otherHeard: string[] = Array.isArray(o.heard_tokens)
      ? o.heard_tokens.map((x: unknown) => normalizeToken(x)).filter((t): t is string => t != null)
      : [];
    const otherToken = normalizeToken(o.my_token);
    if (!otherToken) continue;

    const mutual = heardTokens.includes(otherToken) && otherHeard.includes(myToken);
    const intersect = tokenSetsIntersect(heardTokens, otherHeard);

    if (!mutual && !intersect) continue;

    if (lat != null && lon != null && o.lat != null && o.lon != null) {
      const d = haversineMeters(lat, lon, Number(o.lat), Number(o.lon));
      if (d > PROXIMITY_MATCH_MAX_M) continue;
    }

    matchedIds.add(String(o.user_id));
  }

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

  // Only remove this device's handshake row so other participants can still bind within the TTL
  // window and receive the same peer set (multi-person tap).
  await admin.from('proximity_handshake_events').delete().eq('id', String(inserted.id));

  const ids = [...matchedIds];

  const encLat =
    lat != null && lon != null && !(lat === 0 && lon === 0) ? lat : null;
  const encLon =
    lat != null && lon != null && !(lat === 0 && lon === 0) ? lon : null;

  let relativeAltitudeM: number | null = null;
  if (exactBarometricElevationM != null && encLat != null && encLon != null) {
    const terrainM = await fetchTerrainElevationM(encLat, encLon);
    if (terrainM != null) {
      relativeAltitudeM = exactBarometricElevationM - terrainM;
    }
  }

  async function connectionIdForPair(peerId: string): Promise<string | null> {
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

  /** Per-peer: should the client offer the post-crossing context-tagging flow for this peer? */
  const peerEncounterLogged: { peerId: string; connectionId: string | null; encounterLogged: boolean; reason?: string }[] =
    [];

  for (const peerId of ids) {
    const connectionId = await connectionIdForPair(peerId);
    if (!connectionId) {
      peerEncounterLogged.push({
        peerId,
        connectionId: null,
        encounterLogged: true,
      });
      continue;
    }
    const insertRow: Record<string, unknown> = {
      connection_id: connectionId,
      encountered_at: new Date().toISOString(),
      context_tags: [],
    };
    if (encLat != null && encLon != null) {
      insertRow.gps_lat = encLat;
      insertRow.gps_lon = encLon;
    }
    if (noiseLevel != null) insertRow.noise_level = noiseLevel;
    if (exactNoiseLevelDb != null) insertRow.exact_noise_level_db = exactNoiseLevelDb;
    if (exactBarometricElevationM != null) {
      insertRow.exact_barometric_elevation_m = exactBarometricElevationM;
    }
    if (relativeAltitudeM != null) insertRow.relative_altitude_m = relativeAltitudeM;
    const outcome = await insertOrDebounceEncounter(connectionId, insertRow, encLat, encLon);
    if (outcome === 'rate_limited') {
      peerEncounterLogged.push({
        peerId,
        connectionId,
        encounterLogged: false,
        reason: 'rate_limit_active',
      });
    } else {
      peerEncounterLogged.push({
        peerId,
        connectionId,
        encounterLogged: true,
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
      ...(meta?.reason ? { reason: meta.reason } : {}),
    };
    return base;
  });

  return new Response(
    JSON.stringify({
      success: true,
      encounter_logged: aggregateEncounterLogged,
      matches,
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
