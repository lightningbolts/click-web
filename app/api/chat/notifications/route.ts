/**
 * Per-conversation notifications (push mutes).
 *
 * GET /api/chat/notifications → { mutes: [{ chat_id, muted_until }] } your active mutes
 * PUT /api/chat/notifications { chat_id, muted, muted_until? } → mute until a time (omit or
 *     null: until turned back on), or unmute with `muted: false`.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseFromRouteRequest } from '@/lib/server/supabaseRouteAuth';
import { createAdminClient } from '@/lib/server/connectionWriteAuth';
import { parseBody } from '@/lib/api/parseBody';
import { chatMuteBodySchema } from '@/lib/api/schemas/chat';

export async function GET(request: NextRequest) {
  const { user, authError } = await getSupabaseFromRouteRequest(request);
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data, error } = await createAdminClient()
    .from('chat_mutes')
    .select('chat_id, muted_until')
    .eq('user_id', user.id)
    .or(`muted_until.is.null,muted_until.gt.${new Date().toISOString()}`);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ mutes: data ?? [] });
}

export async function PUT(request: NextRequest) {
  const { user, authError } = await getSupabaseFromRouteRequest(request);
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const parsed = await parseBody(request, chatMuteBodySchema);
  if (!parsed.ok) return parsed.response;
  const { chat_id: chatId, muted, muted_until: mutedUntil } = parsed.data;
  const admin = createAdminClient();
  if (!muted) {
    const { error } = await admin.from('chat_mutes').delete().eq('user_id', user.id).eq('chat_id', chatId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ chat_id: chatId, muted_until: null, muted: false });
  }
  if (mutedUntil && Date.parse(mutedUntil) <= Date.now()) {
    return NextResponse.json({ error: 'muted_until must be in the future' }, { status: 400 });
  }
  const { error } = await admin
    .from('chat_mutes')
    .upsert({ user_id: user.id, chat_id: chatId, muted_until: mutedUntil ?? null, updated_at: new Date().toISOString() });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ chat_id: chatId, muted_until: mutedUntil ?? null, muted: true });
}
