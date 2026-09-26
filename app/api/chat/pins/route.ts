/**
 * Pinned messages (direct and group chats).
 *
 * GET    /api/chat/pins?chatId=<uuid> → { pins: [{ message_id, pinned_by, pinned_at }] } newest first
 * POST   /api/chat/pins { messageId } → pins it (re-pinning moves it to the top)
 * DELETE /api/chat/pins { messageId } → unpins it
 */
import { NextRequest, NextResponse } from 'next/server';
import {
  assertChatWritable,
  assertMessageInWritableChat,
  createChatGatekeeperAdmin,
  requireBearerUser,
} from '@/lib/server/chatGatekeeper';
import { parseBody } from '@/lib/api/parseBody';
import { chatPinBodySchema } from '@/lib/api/schemas/chat';

export async function GET(req: NextRequest) {
  const jwt = await requireBearerUser(req);
  if (!jwt.ok) return jwt.response;
  const chatId = req.nextUrl.searchParams.get('chatId') ?? '';
  const admin = createChatGatekeeperAdmin();
  const denied = await assertChatWritable(admin, jwt.user.id, chatId);
  if (denied) return denied;

  const { data, error } = await admin
    .from('message_pins')
    .select('message_id, pinned_by, pinned_at')
    .eq('chat_id', chatId.trim())
    .is('unpinned_at', null)
    .order('pinned_at', { ascending: false })
    .limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ pins: data ?? [] });
}

async function setPinned(req: NextRequest, pinned: boolean) {
  const jwt = await requireBearerUser(req);
  if (!jwt.ok) return jwt.response;
  const parsed = await parseBody(req, chatPinBodySchema);
  if (!parsed.ok) return parsed.response;
  const messageId = parsed.data.messageId.trim();

  const admin = createChatGatekeeperAdmin();
  const gate = await assertMessageInWritableChat(admin, jwt.user.id, messageId);
  if (!gate.ok) return gate.response;

  const now = new Date().toISOString();
  const { error } = pinned
    ? await admin.from('message_pins').upsert({
        chat_id: gate.chatId,
        message_id: messageId,
        pinned_by: jwt.user.id,
        pinned_at: now,
        unpinned_at: null,
      })
    : await admin
        .from('message_pins')
        .update({ unpinned_at: now })
        .eq('chat_id', gate.chatId)
        .eq('message_id', messageId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ message_id: messageId, pinned });
}

export async function POST(req: NextRequest) {
  return setPinned(req, true);
}

export async function DELETE(req: NextRequest) {
  return setPinned(req, false);
}
