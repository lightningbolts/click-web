/**
 * Edge Function: match-availability
 * Finds overlapping timeframe + intent_tag among peers on mutually kept connections
 * and returns a push-notification-shaped payload (for send-push-notification or FCM).
 *
 * Invoke with Authorization: Bearer <user JWT>
 *
 * Timeframe format: "ISO_START/ISO_END" (UTC), e.g. 2026-04-03T14:00:00.000Z/2026-04-03T16:00:00.000Z
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function parseRange(timeframe: string): { start: number; end: number } | null {
  const parts = timeframe.split('/');
  if (parts.length !== 2) return null;
  const start = Date.parse(parts[0].trim());
  const end = Date.parse(parts[1].trim());
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  return { start, end };
}

function rangesOverlap(a: { start: number; end: number }, b: { start: number; end: number }): boolean {
  return a.start < b.end && b.start < a.end;
}

function normalizeTag(tag: string): string {
  return tag.trim().toLowerCase();
}

function isMutuallyKept(row: {
  should_continue?: boolean[] | null;
  expiry_state?: string | null;
}): boolean {
  const sc = row.should_continue;
  if (Array.isArray(sc) && sc.length >= 2 && sc[0] === true && sc[1] === true) {
    return true;
  }
  return row.expiry_state === 'kept';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
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

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userData?.user) {
    return new Response(JSON.stringify({ error: 'Invalid or expired token' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const userId = userData.user.id;
  const nowIso = new Date().toISOString();

  const { data: connections, error: connErr } = await admin
    .from('connections')
    .select('id, user_ids, should_continue, expiry_state')
    .contains('user_ids', [userId]);

  if (connErr) {
    return new Response(JSON.stringify({ error: connErr.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const peerIds = new Set<string>();
  const connectionByPeer = new Map<string, string>();

  for (const row of connections ?? []) {
    if (!isMutuallyKept(row)) continue;
    const ids = (row.user_ids as string[] | null) ?? [];
    const peer = ids.find((id) => id !== userId);
    if (!peer) continue;
    peerIds.add(peer);
    connectionByPeer.set(peer, row.id as string);
  }

  if (peerIds.size === 0) {
    return new Response(
      JSON.stringify({
        matches: [],
        push_notification: null,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const { data: myIntents, error: myErr } = await admin
    .from('availability_intents')
    .select('id, timeframe, intent_tag, expires_at')
    .eq('user_id', userId)
    .gt('expires_at', nowIso);

  if (myErr) {
    return new Response(JSON.stringify({ error: myErr.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const peerList = [...peerIds];
  const { data: peerIntents, error: peerErr } = await admin
    .from('availability_intents')
    .select('id, user_id, timeframe, intent_tag, expires_at')
    .in('user_id', peerList)
    .gt('expires_at', nowIso);

  if (peerErr) {
    return new Response(JSON.stringify({ error: peerErr.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  type IntentRow = {
    id: string;
    user_id?: string;
    timeframe: string;
    intent_tag: string;
    expires_at: string;
  };

  const matches: Array<{
    intent_tag: string;
    timeframe_a: string;
    timeframe_b: string;
    peer_user_id: string;
    connection_id: string;
    intent_ids: [string, string];
  }> = [];

  for (const mine of (myIntents ?? []) as IntentRow[]) {
    const myRange = parseRange(mine.timeframe);
    if (!myRange) continue;
    const myTag = normalizeTag(mine.intent_tag);
    if (!myTag) continue;

    for (const theirs of (peerIntents ?? []) as IntentRow[]) {
      if (!theirs.user_id || theirs.user_id === userId) continue;
      if (normalizeTag(theirs.intent_tag) !== myTag) continue;
      const theirRange = parseRange(theirs.timeframe);
      if (!theirRange) continue;
      if (!rangesOverlap(myRange, theirRange)) continue;

      const connectionId = connectionByPeer.get(theirs.user_id);
      if (!connectionId) continue;

      matches.push({
        intent_tag: mine.intent_tag.trim(),
        timeframe_a: mine.timeframe,
        timeframe_b: theirs.timeframe,
        peer_user_id: theirs.user_id,
        connection_id: connectionId,
        intent_ids: [mine.id, theirs.id],
      });
    }
  }

  let push_notification: Record<string, unknown> | null = null;

  if (matches.length > 0) {
    const m = matches[0];
    const peerLabel = m.peer_user_id.slice(0, 8);
    push_notification = {
      title: 'Availability match',
      body: `You and a connection are both available for “${m.intent_tag}”.`,
      data: {
        type: 'availability_match',
        intent_tag: m.intent_tag,
        your_timeframe: m.timeframe_a,
        peer_timeframe: m.timeframe_b,
        peer_user_id: m.peer_user_id,
        connection_id: m.connection_id,
        match_count: String(matches.length),
      },
    };
  }

  return new Response(
    JSON.stringify({
      matches,
      push_notification,
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
