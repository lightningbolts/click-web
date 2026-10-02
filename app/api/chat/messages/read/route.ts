/**
 * PATCH /api/chat/messages/read
 * Body: { chat_id: string }
 * Marks all messages from the other participant(s) in the chat as read (server role, bypasses RLS)
 * and records this member's read cursor.
 *
 * GET /api/chat/messages/read?chatId=<uuid>
 * Every member's read cursor (group read receipts).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseFromRouteRequest } from '@/lib/server/supabaseRouteAuth';
import {
  assertChatWritable,
  createChatGatekeeperAdmin,
} from '@/lib/server/chatGatekeeper';
import { parseBody } from '@/lib/api/parseBody';
import { chatIdBodySchema } from '@/lib/api/schemas/chat';

/** GET ?chatId=<uuid> → { cursors: [{ user_id, read_through }] } for every member who has read. */
export async function GET(req: NextRequest) {
  const chatId = req.nextUrl.searchParams.get('chatId')?.trim() ?? '';
  const { user, authError } = await getSupabaseFromRouteRequest(req);
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createChatGatekeeperAdmin();
  const denied = await assertChatWritable(admin, user.id, chatId);
  if (denied) return denied;

  const { data, error } = await admin
    .from('chat_read_cursors')
    .select('user_id, read_through')
    .eq('chat_id', chatId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ cursors: data ?? [] });
}

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

  // Where this member has read up to (group read receipts); best effort.
  const { error: cursorErr } = await admin
    .from('chat_read_cursors')
    .upsert({ chat_id: chatId, user_id: user.id, read_through: readStamp, updated_at: new Date(readStamp).toISOString() });
  if (cursorErr) console.warn('chat_read_cursors upsert failed:', cursorErr.message);

  return new NextResponse(null, { status: 200 });
}
