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
