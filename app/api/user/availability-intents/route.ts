/**
 * Own-user `availability_intents` (RLS: user_id = auth.uid()).
 * GET list (non-expired) · POST create · DELETE ?id=
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedSupabase } from '@/lib/server/supabaseAuth';
import {
  AVAILABILITY_INTENT_DURATION_PRESETS,
  DEFAULT_AVAILABILITY_INTENT_DURATION_MS,
} from '@/lib/availabilityIntentDurations';

const INTENT_TAG_MAX = 25;

const DURATION_PRESETS = AVAILABILITY_INTENT_DURATION_PRESETS;
const DEFAULT_DURATION_MS = DEFAULT_AVAILABILITY_INTENT_DURATION_MS;

function resolveTimeframeAndMs(body: {
  timeframe?: unknown;
  durationMs?: unknown;
}): { timeframe: string; durationMs: number } {
  const rawMs = body.durationMs;
  if (typeof rawMs === 'number' && Number.isFinite(rawMs) && rawMs >= 60_000 && rawMs <= 48 * 60 * 60_000) {
    const preset = DURATION_PRESETS.find((p) => p.ms === rawMs);
    const timeframe =
      typeof body.timeframe === 'string' && body.timeframe.trim()
        ? body.timeframe.trim()
        : preset?.label ?? `${Math.round(rawMs / 60_000)} min`;
    return { timeframe, durationMs: rawMs };
  }
  const tf =
    typeof body.timeframe === 'string' && body.timeframe.trim()
      ? body.timeframe.trim()
      : null;
  if (tf) {
    const preset = DURATION_PRESETS.find((p) => p.label.toLowerCase() === tf.toLowerCase());
    return { timeframe: tf, durationMs: preset?.ms ?? DEFAULT_DURATION_MS };
  }
  const preset = DURATION_PRESETS.find((p) => p.label === '3 hours');
  return { timeframe: preset?.label ?? '3 hours', durationMs: preset?.ms ?? DEFAULT_DURATION_MS };
}

export async function GET(request: NextRequest) {
  const { user, supabase } = await getAuthenticatedSupabase(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from('availability_intents')
    .select('id, timeframe, intent_tag, expires_at')
    .eq('user_id', user.id)
    .gt('expires_at', nowIso)
    .order('expires_at', { ascending: true });

  if (error) {
    console.error('availability_intents GET:', error.message);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ intents: data ?? [] });
}

export async function POST(request: NextRequest) {
  const { user, supabase } = await getAuthenticatedSupabase(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { intent_tag?: unknown; timeframe?: unknown; durationMs?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const tagRaw = typeof body.intent_tag === 'string' ? body.intent_tag.trim() : '';
  if (!tagRaw || tagRaw.length > INTENT_TAG_MAX) {
    return NextResponse.json(
      { error: `intent_tag is required (max ${INTENT_TAG_MAX} characters)` },
      { status: 400 },
    );
  }

  const { timeframe, durationMs } = resolveTimeframeAndMs(body);
  const startMs = Date.now();
  const endMs = startMs + durationMs;
  const startsAt = new Date(startMs).toISOString();
  const endsAt = new Date(endMs).toISOString();
  /** Match mobile: `expires_at` equals end of window. */
  const expiresAt = endsAt;

  const { data: row, error } = await supabase
    .from('availability_intents')
    .insert({
      user_id: user.id,
      intent_tag: tagRaw,
      timeframe,
      starts_at: startsAt,
      ends_at: endsAt,
      expires_at: expiresAt,
    })
    .select('id, timeframe, intent_tag, expires_at')
    .maybeSingle();

  if (error) {
    console.error('availability_intents POST:', error.message);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ intent: row });
}

export async function DELETE(request: NextRequest) {
  const { user, supabase } = await getAuthenticatedSupabase(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const id = request.nextUrl.searchParams.get('id')?.trim();
  if (!id) {
    return NextResponse.json({ error: 'id query parameter required' }, { status: 400 });
  }

  const { error } = await supabase
    .from('availability_intents')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) {
    console.error('availability_intents DELETE:', error.message);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
