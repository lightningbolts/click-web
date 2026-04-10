/**
 * Edge Function: bind-proximity-connection
 *
 * POST JSON { my_token, heard_tokens[], latitude?, longitude? }
 * Authorization: Bearer <user JWT>
 *
 * Inserts this device's handshake, then returns other users whose pings overlap in time,
 * distance (≤15m when both have GPS), and token evidence (mutual hear or heard_tokens intersect).
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type UserProfile = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  created_at: number;
};

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
    my_token?: string;
    heard_tokens?: unknown[];
    latitude?: number;
    longitude?: number;
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

  const lat = typeof body.latitude === 'number' && Number.isFinite(body.latitude) ? body.latitude : null;
  const lon = typeof body.longitude === 'number' && Number.isFinite(body.longitude) ? body.longitude : null;

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

  const windowStart = new Date(t0 - 10_000).toISOString();
  const { data: recent, error: qErr } = await admin
    .from('proximity_handshake_events')
    .select('user_id, my_token, heard_tokens, lat, lon, created_at')
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
    if (!Number.isFinite(ot) || Math.abs(ot - t0) > 3000) continue;

    const otherHeard: string[] = Array.isArray(o.heard_tokens)
      ? o.heard_tokens.map((x: unknown) => normalizeToken(x)).filter((t): t is string => t != null)
      : [];
    const otherToken = normalizeToken(o.my_token);
    if (!otherToken) continue;

    const mutual =
      heardTokens.includes(otherToken) && otherHeard.includes(myToken);
    const intersect = tokenSetsIntersect(heardTokens, otherHeard);

    if (!mutual && !intersect) continue;

    if (lat != null && lon != null && o.lat != null && o.lon != null) {
      const d = haversineMeters(lat, lon, Number(o.lat), Number(o.lon));
      if (d > 15) continue;
    }

    matchedIds.add(String(o.user_id));
  }

  await admin.from('proximity_handshake_events').delete().eq('id', inserted.id);

  if (matchedIds.size === 0) {
    return new Response(JSON.stringify({ matches: [] as UserProfile[] }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const ids = [...matchedIds];

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

  for (const peerId of ids) {
    const connectionId = await connectionIdForPair(peerId);
    if (!connectionId) continue;
    const insertRow: Record<string, unknown> = {
      connection_id: connectionId,
      encountered_at: new Date().toISOString(),
      context_tags: [],
    };
    if (lat != null && lon != null && Number.isFinite(lat) && Number.isFinite(lon) && !(lat === 0 && lon === 0)) {
      insertRow.gps_lat = lat;
      insertRow.gps_lon = lon;
    }
    const { error: encErr } = await admin.from('connection_encounters').insert(insertRow);
    if (encErr) {
      const msg = encErr.message ?? '';
      if (msg.includes('encounter_rate_limit_3h')) {
        const nowMs = Date.now();
        await admin.from('chats').update({ updated_at: nowMs }).eq('connection_id', connectionId);
      } else {
        console.warn('bind-proximity-connection encounter:', encErr.message);
      }
    }
  }

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

  const matches: UserProfile[] = (users ?? []).map((u: Record<string, unknown>) => ({
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
  }));

  return new Response(JSON.stringify({ matches }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
