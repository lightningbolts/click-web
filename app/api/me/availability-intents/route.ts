/**
 * GET /api/me/availability-intents — current non-expired intents + last_intent_update_at
 * PATCH /api/me/availability-intents — replace intents and bump last_intent_update_at
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthenticatedSupabase } from '@/lib/server/supabaseAuth';

function createAdminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  );
}

const MAX_INTENTS = 12;
const MAX_TAG_LEN = 25;

type IncomingIntent = {
  timeframe?: string;
  intent_tag?: string;
  expires_at?: string;
};

export async function GET(req: NextRequest) {
  const { user } = await getAuthenticatedSupabase(req);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const nowIso = new Date().toISOString();

  const [{ data: userRow, error: userErr }, { data: intentRows, error: intentErr }] = await Promise.all([
    admin.from('users').select('last_intent_update_at').eq('id', user.id).maybeSingle(),
    admin
      .from('availability_intents')
      .select('id, timeframe, intent_tag, expires_at')
      .eq('user_id', user.id)
      .gt('expires_at', nowIso)
      .order('expires_at', { ascending: true }),
  ]);

  if (userErr) {
    return NextResponse.json({ error: userErr.message }, { status: 400 });
  }
  if (intentErr) {
    return NextResponse.json({ error: intentErr.message }, { status: 400 });
  }

  const last_intent_update_at =
    userRow && typeof (userRow as { last_intent_update_at?: string }).last_intent_update_at === 'string'
      ? (userRow as { last_intent_update_at: string }).last_intent_update_at
      : null;

  return NextResponse.json({
    last_intent_update_at,
    intents: intentRows ?? [],
  });
}

function normalizeIntents(body: unknown): { timeframe: string; intent_tag: string; expires_at: string }[] | null {
  if (!body || typeof body !== 'object') return null;
  const raw = (body as { intents?: unknown }).intents;
  if (!Array.isArray(raw)) return null;
  const out: { timeframe: string; intent_tag: string; expires_at: string }[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const o = item as IncomingIntent;
    const timeframe = typeof o.timeframe === 'string' ? o.timeframe.trim() : '';
    const intent_tag = typeof o.intent_tag === 'string' ? o.intent_tag.trim().slice(0, MAX_TAG_LEN) : '';
    const expires_at = typeof o.expires_at === 'string' ? o.expires_at.trim() : '';
    if (!timeframe || !intent_tag || !expires_at) continue;
    const expMs = Date.parse(expires_at);
    if (!Number.isFinite(expMs) || expMs <= Date.now()) continue;
    out.push({ timeframe, intent_tag, expires_at });
    if (out.length >= MAX_INTENTS) break;
  }
  return out;
}

export async function PATCH(req: NextRequest) {
  const { user } = await getAuthenticatedSupabase(req);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const intents = normalizeIntents(body);
  if (intents === null) {
    return NextResponse.json({ error: 'intents array required' }, { status: 400 });
  }

  const admin = createAdminClient();
  const nowIso = new Date().toISOString();

  const { error: delErr } = await admin
    .from('availability_intents')
    .delete()
    .eq('user_id', user.id)
    .gt('expires_at', nowIso);

  if (delErr) {
    console.error('availability_intents delete:', delErr);
    return NextResponse.json({ error: delErr.message }, { status: 400 });
  }

  if (intents.length > 0) {
    const rows = intents.map((i) => ({
      user_id: user.id,
      timeframe: i.timeframe,
      intent_tag: i.intent_tag,
      expires_at: i.expires_at,
    }));
    const { error: insErr } = await admin.from('availability_intents').insert(rows);
    if (insErr) {
      console.error('availability_intents insert:', insErr);
      return NextResponse.json({ error: insErr.message }, { status: 400 });
    }
  }

  const { error: userErr } = await admin
    .from('users')
    .update({ last_intent_update_at: nowIso })
    .eq('id', user.id);

  if (userErr) {
    console.error('users last_intent_update_at:', userErr);
    return NextResponse.json({ error: userErr.message }, { status: 400 });
  }

  const { data: refreshed, error: fetchErr } = await admin
    .from('availability_intents')
    .select('id, timeframe, intent_tag, expires_at')
    .eq('user_id', user.id)
    .gt('expires_at', nowIso)
    .order('expires_at', { ascending: true });

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 400 });
  }

  return NextResponse.json({
    success: true,
    last_intent_update_at: nowIso,
    intents: refreshed ?? [],
  });
}
