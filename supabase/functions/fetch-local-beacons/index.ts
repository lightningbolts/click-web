/**
 * Edge Function: fetch-local-beacons
 *
 * POST JSON { lat: number, lng: number, radius_meters?: number }
 * Authorization: Bearer <user JWT>
 *
 * Returns active map_beacons within radius using PostGIS ST_DWithin (via RPC).
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function finiteNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
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
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  if (!supabaseUrl || !anonKey) {
    return new Response(JSON.stringify({ error: 'Server misconfigured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });

  const {
    data: { user },
    error: userErr,
  } = await userClient.auth.getUser(jwt);
  if (userErr || !user?.id) {
    return new Response(JSON.stringify({ error: 'Invalid session' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let body: { lat?: unknown; lng?: unknown; radius_meters?: unknown };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const lat = finiteNumber(body.lat);
  const lng = finiteNumber(body.lng);
  const radiusRaw = finiteNumber(body.radius_meters);
  const radius_m = radiusRaw != null ? Math.min(Math.max(radiusRaw, 100), 50_000) : 5000;

  if (lat == null || lng == null) {
    return new Response(JSON.stringify({ error: 'lat and lng are required finite numbers' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { data, error } = await userClient.rpc('fetch_map_beacons_within', {
    lat,
    lng,
    radius_meters: radius_m,
    p_limit: 200,
  });

  if (error) {
    console.error('fetch_map_beacons_within:', error.message);
    return new Response(JSON.stringify({ error: 'Failed to load beacons', detail: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const beacons = data != null && typeof data === 'object' && !Array.isArray(data) && 'beacons' in data
    ? (data as { beacons: unknown }).beacons
    : data;
  const list = Array.isArray(beacons) ? beacons : [];
  return new Response(JSON.stringify({ beacons: list }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
