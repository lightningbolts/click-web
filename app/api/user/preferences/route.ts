import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseFromRouteRequest } from '@/lib/server/supabaseRouteAuth';
import { parseBody } from '@/lib/api/parseBody';
import { preferencesBodySchema } from '@/lib/api/schemas/user';

type PreferencesBody = {
  message_push_enabled?: unknown;
  call_push_enabled?: unknown;
  event_reminder_push_enabled?: unknown;
  availability_match_push_enabled?: unknown;
  hub_message_push_enabled?: unknown;
  event_teaser_push_enabled?: unknown;
  reconnect_nudge_push_enabled?: unknown;
};

const PREF_KEYS = [
  'message_push_enabled',
  'call_push_enabled',
  'event_reminder_push_enabled',
  'availability_match_push_enabled',
  'hub_message_push_enabled',
  'event_teaser_push_enabled',
  'reconnect_nudge_push_enabled',
] as const;

/**
 * PATCH /api/user/preferences
 * Upserts the signed-in user's row in `notification_preferences` (RLS + JWT).
 */
export async function PATCH(request: NextRequest) {
  const { user, supabase, authError } = await getSupabaseFromRouteRequest(request);

  if (authError != null || user == null) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const parsed = await parseBody(request, preferencesBodySchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data as PreferencesBody;

  const incoming: Partial<Record<(typeof PREF_KEYS)[number], boolean>> = {};
  for (const key of PREF_KEYS) {
    if (typeof body[key] === 'boolean') incoming[key] = body[key];
  }

  if (Object.keys(incoming).length === 0) {
    return NextResponse.json(
      { error: `Provide at least one of ${PREF_KEYS.join(', ')}` },
      { status: 400 },
    );
  }

  const { data: existing, error: readErr } = await supabase
    .from('notification_preferences')
    .select(PREF_KEYS.join(', '))
    .eq('user_id', user.id)
    .maybeSingle();

  if (readErr) {
    console.error('notification_preferences read:', readErr.message);
    return NextResponse.json({ error: readErr.message }, { status: 500 });
  }

  type PrefRow = Partial<Record<(typeof PREF_KEYS)[number], boolean>>;
  const prev = (existing ?? {}) as PrefRow;
  const updatedAt = Date.now();
  const row: Record<string, unknown> = {
    user_id: user.id,
    updated_at: updatedAt,
  };
  for (const key of PREF_KEYS) {
    row[key] = incoming[key] ?? prev[key] ?? true;
  }

  const { error } = await supabase.from('notification_preferences').upsert(row, {
    onConflict: 'user_id',
  });

  if (error) {
    console.error('notification_preferences upsert:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    message: 'Notification preferences saved',
    ...Object.fromEntries(PREF_KEYS.map((key) => [key, row[key]])),
  });
}
