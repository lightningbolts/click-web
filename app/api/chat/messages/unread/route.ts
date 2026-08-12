/**
 * PATCH /api/chat/messages/unread
 * Body: { chat_id: string }
 * Marks the latest peer-authored message in the chat as unread (server role, bypasses RLS).
 * Inbox unread counts derive from messages.is_read on peer rows, so this syncs across devices.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseFromRouteRequest } from '@/lib/server/supabaseRouteAuth';
import {
  assertChatWritable,
  createChatGatekeeperAdmin,
} from '@/lib/server/chatGatekeeper';
import { parseBody } from '@/lib/api/parseBody';
import { chatIdBodySchema } from '@/lib/api/schemas/chat';

export async function PATCH(req: NextRequest) {
  const parsed = await parseBody(req, chatIdBodySchema);
  if (!parsed.ok) return parsed.response;
  const chatId = parsed.data.chat_id.trim();

  const { user, authError } = await getSupabaseFromRouteRequest(req);
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createChatGatekeeperAdmin();
  const denied = await assertChatWritable(admin, user.id, chatId);
  if (denied) return denied;

  const { data: latestPeer, error: latestErr } = await admin
    .from('messages')
    .select('id')
    .eq('chat_id', chatId)
    .neq('user_id', user.id)
    .order('time_created', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestErr) {
    return NextResponse.json({ error: latestErr.message }, { status: 500 });
  }

  if (!latestPeer?.id) {
    return new NextResponse(null, { status: 204 });
  }

  const { error } = await admin
    .from('messages')
    .update({ is_read: false, read_at: null })
    .eq('id', latestPeer.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return new NextResponse(null, { status: 200 });
}
