/**
 * Scheduled messages (own, per chat).
 *
 * GET    /api/chat/scheduled?chatId=<uuid>   → { scheduled: [...] } pending, soonest first
 * POST   /api/chat/scheduled                 → same body as POST /api/chat/messages plus
 *        `send_at` (ms epoch). Validated exactly like a send; delivered by the per-minute cron.
 * DELETE /api/chat/scheduled?id=<uuid>       → cancels one
 */

import { NextRequest, NextResponse } from 'next/server';
import { createChatGatekeeperAdmin, requireBearerUser } from '@/lib/server/chatGatekeeper';
import { prepareChatMessageWrite } from '@/lib/server/chatMessageWrite';

const MAX_AHEAD_MS = 365 * 24 * 60 * 60 * 1000;
const COLUMNS = 'id, chat_id, content, message_type, metadata, send_at';

export async function GET(req: NextRequest) {
  const chatId = req.nextUrl.searchParams.get('chatId')?.trim();
  if (!chatId) return NextResponse.json({ error: 'chatId is required' }, { status: 400 });
  const jwt = await requireBearerUser(req);
  if (!jwt.ok) return jwt.response;

  const { data, error } = await createChatGatekeeperAdmin()
    .from('scheduled_messages')
    .select(COLUMNS)
    .eq('user_id', jwt.user.id)
    .eq('chat_id', chatId)
    .order('send_at', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ scheduled: data ?? [] });
}

export async function POST(req: NextRequest) {
  const prepared = await prepareChatMessageWrite(req);
  if (prepared instanceof NextResponse) return prepared;

  const sendAt = Number(prepared.body.send_at ?? prepared.body.sendAt);
  const now = Date.now();
  if (!Number.isFinite(sendAt) || sendAt <= now || sendAt > now + MAX_AHEAD_MS) {
    return NextResponse.json({ error: 'send_at must be a future time within a year' }, { status: 400 });
  }

  const { data, error } = await createChatGatekeeperAdmin()
    .from('scheduled_messages')
    .insert({
      chat_id: prepared.chatId,
      user_id: prepared.userId,
      content: prepared.content,
      message_type: prepared.messageType,
      metadata: prepared.metadata ?? {},
      send_at: Math.trunc(sendAt),
    })
    .select(COLUMNS)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ scheduled: data }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')?.trim();
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });
  const jwt = await requireBearerUser(req);
  if (!jwt.ok) return jwt.response;

  const { data, error } = await createChatGatekeeperAdmin()
    .from('scheduled_messages')
    .delete()
    .eq('id', id)
    .eq('user_id', jwt.user.id)
    .select('id');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // Already delivered (or never ours): nothing left to cancel.
  if (!data?.length) return NextResponse.json({ error: 'Scheduled message not found' }, { status: 404 });
  return new NextResponse(null, { status: 204 });
}
