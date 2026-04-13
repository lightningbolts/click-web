import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseFromRouteRequest } from '@/lib/server/supabaseRouteAuth';

type PreferencesBody = {
  message_push_enabled?: unknown;
  call_push_enabled?: unknown;
};

/**
 * PATCH /api/user/preferences
 * Upserts the signed-in user's row in `notification_preferences` (RLS + JWT).
 */
export async function PATCH(request: NextRequest) {
  const { user, supabase, authError } = await getSupabaseFromRouteRequest(request);

  if (authError != null || user == null) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: PreferencesBody;
  try {
    body = (await request.json()) as PreferencesBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const messagePush =
    typeof body.message_push_enabled === 'boolean' ? body.message_push_enabled : undefined;
  const callPush = typeof body.call_push_enabled === 'boolean' ? body.call_push_enabled : undefined;

  if (messagePush === undefined && callPush === undefined) {
    return NextResponse.json(
      { error: 'Provide at least one of message_push_enabled, call_push_enabled' },
      { status: 400 },
    );
  }

  const { data: existing, error: readErr } = await supabase
    .from('notification_preferences')
    .select('message_push_enabled, call_push_enabled')
    .eq('user_id', user.id)
    .maybeSingle();

  if (readErr) {
    console.error('notification_preferences read:', readErr.message);
    return NextResponse.json({ error: readErr.message }, { status: 500 });
  }

  type PrefRow = { message_push_enabled?: boolean; call_push_enabled?: boolean };
  const prev = (existing ?? {}) as PrefRow;
  const updatedAt = Date.now();
  const row = {
    user_id: user.id,
    updated_at: updatedAt,
    message_push_enabled: messagePush ?? prev.message_push_enabled ?? true,
    call_push_enabled: callPush ?? prev.call_push_enabled ?? true,
  };

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
    message_push_enabled: row.message_push_enabled,
    call_push_enabled: row.call_push_enabled,
  });
}
