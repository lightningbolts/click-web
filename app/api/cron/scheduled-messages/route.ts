import { NextRequest, NextResponse } from 'next/server';
import { assertChatWritable, createChatGatekeeperAdmin } from '@/lib/server/chatGatekeeper';
import { insertChatMessage } from '@/lib/server/chatMessageWrite';
import type { MessageType } from '@/lib/chat/types';
import { authorizeCronRequest, cronPushBearer } from '@/lib/server/cronAuth';

type ScheduledRow = {
  id: string;
  chat_id: string;
  user_id: string;
  content: string;
  message_type: MessageType;
  metadata: unknown;
};

/**
 * Per-minute delivery of due scheduled messages (pg_cron → cron-scheduled-messages edge
 * function → here). Each row is claimed by deleting it first, so overlapping
 * runs never deliver twice; a sender who lost access to the chat is skipped.
 */
export async function GET(request: NextRequest) {
  if (!authorizeCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createChatGatekeeperAdmin();
  const { data: due, error } = await admin
    .from('scheduled_messages')
    .select('id')
    .lte('send_at', Date.now())
    .order('send_at', { ascending: true })
    .limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let delivered = 0;
  let skipped = 0;
  for (const { id } of due ?? []) {
    const { data: claimed } = await admin
      .from('scheduled_messages')
      .delete()
      .eq('id', id)
      .select('id, chat_id, user_id, content, message_type, metadata')
      .maybeSingle<ScheduledRow>();
    if (!claimed) continue;

    if (await assertChatWritable(admin, claimed.user_id, claimed.chat_id)) {
      skipped += 1;
      continue;
    }
    const result = await insertChatMessage(
      admin,
      {
        chatId: claimed.chat_id,
        userId: claimed.user_id,
        content: claimed.content,
        messageType: claimed.message_type,
        metadata: claimed.metadata,
        localSentAtMs: null,
      },
      Date.now(),
      cronPushBearer(),
    );
    if ('error' in result) skipped += 1;
    else delivered += 1;
  }
  return NextResponse.json({ ok: true, delivered, skipped });
}
