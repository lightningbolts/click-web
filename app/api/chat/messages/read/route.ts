/**
 * PATCH /api/chat/messages/read
 * Body: { chat_id: string }
 * Marks all messages from the other participant(s) in the chat as read (server role, bypasses RLS).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseFromRouteRequest } from '@/lib/server/supabaseRouteAuth';
import {
  assertChatWritable,
  createChatGatekeeperAdmin,
} from '@/lib/server/chatGatekeeper';

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const chatId =
    typeof body.chat_id === 'string'
      ? body.chat_id.trim()
      : typeof body.chatId === 'string'
        ? body.chatId.trim()
        : '';

  if (!chatId) {
    return NextResponse.json({ error: 'chat_id is required' }, { status: 400 });
  }

  const { user, authError } = await getSupabaseFromRouteRequest(req);
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createChatGatekeeperAdmin();
  const denied = await assertChatWritable(admin, user.id, chatId);
  if (denied) return denied;

  const readStamp = Date.now();
  const { error } = await admin
    .from('messages')
    .update({ is_read: true, read_at: readStamp })
    .eq('chat_id', chatId)
    .neq('user_id', user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return new NextResponse(null, { status: 200 });
}
