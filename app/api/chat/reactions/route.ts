/**
 * POST   /api/chat/reactions — add a reaction (idempotent on unique constraint)
 * DELETE /api/chat/reactions — remove the caller's reaction for messageId + reactionType
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  assertMessageInWritableChat,
  createChatGatekeeperAdmin,
  requireBearerUser,
} from '@/lib/server/chatGatekeeper';
import { parseBody } from '@/lib/api/parseBody';
import { chatReactionBodySchema } from '@/lib/api/schemas/chat';

export async function POST(req: NextRequest) {
  const jwt = await requireBearerUser(req);
  if (!jwt.ok) return jwt.response;

  const parsed = await parseBody(req, chatReactionBodySchema);
  if (!parsed.ok) return parsed.response;
  const messageId = parsed.data.messageId.trim();
  const reactionType = parsed.data.reactionType.trim();

  const admin = createChatGatekeeperAdmin();
  const gate = await assertMessageInWritableChat(admin, jwt.user.id, messageId);
  if (!gate.ok) return gate.response;

  const now = Date.now();
  const { data: reaction, error: insertErr } = await admin
    .from('message_reactions')
    .insert({
      message_id: messageId,
      user_id: jwt.user.id,
      reaction_type: reactionType,
      created_at: now,
    })
    .select()
    .single();

  if (insertErr) {
    const msg = insertErr.message?.toLowerCase() ?? '';
    if (msg.includes('duplicate') || msg.includes('unique') || (insertErr as { code?: string }).code === '23505') {
      return NextResponse.json({ action: 'exists', reaction: null }, { status: 200 });
    }
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  return NextResponse.json({ action: 'added', reaction }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const jwt = await requireBearerUser(req);
  if (!jwt.ok) return jwt.response;

  const parsed = await parseBody(req, chatReactionBodySchema);
  if (!parsed.ok) return parsed.response;
  const messageId = parsed.data.messageId.trim();
  const reactionType = parsed.data.reactionType.trim();

  const admin = createChatGatekeeperAdmin();
  const gate = await assertMessageInWritableChat(admin, jwt.user.id, messageId);
  if (!gate.ok) return gate.response;

  const { error } = await admin
    .from('message_reactions')
    .delete()
    .eq('message_id', messageId)
    .eq('user_id', jwt.user.id)
    .eq('reaction_type', reactionType);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
