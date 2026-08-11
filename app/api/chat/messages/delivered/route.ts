/**
 * PATCH /api/chat/messages/delivered
 * Body: { chat_id: string; message_ids: string[] }
 * Recipient acknowledges inbound rows (user_id != caller): sets delivered_at when still null.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseFromRouteRequest } from '@/lib/server/supabaseRouteAuth';
import {
  assertChatWritable,
  createChatGatekeeperAdmin,
} from '@/lib/server/chatGatekeeper';
import { parseBody } from '@/lib/api/parseBody';
import { chatDeliveredBodySchema } from '@/lib/api/schemas/chat';

const MAX_IDS = 120;

export async function PATCH(req: NextRequest) {
  const parsed = await parseBody(req, chatDeliveredBodySchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
  const chatId = body.chat_id.trim();

  const rawIds = body.message_ids;
  const messageIds = Array.isArray(rawIds)
    ? rawIds
        .filter((x: unknown) => typeof x === 'string')
        .map((x: string) => x.trim())
        .filter((x: string) => x.length > 0)
    : [];

  if (messageIds.length === 0) {
    return NextResponse.json({ error: 'message_ids is required' }, { status: 400 });
  }
  if (messageIds.length > MAX_IDS) {
    return NextResponse.json({ error: `message_ids must have at most ${MAX_IDS} entries` }, { status: 400 });
  }

  const { user, authError } = await getSupabaseFromRouteRequest(req);
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createChatGatekeeperAdmin();
  const denied = await assertChatWritable(admin, user.id, chatId);
  if (denied) return denied;

  const stamp = Date.now();
  const { data, error } = await admin
    .from('messages')
    .update({ delivered_at: stamp })
    .eq('chat_id', chatId)
    .in('id', messageIds)
    .neq('user_id', user.id)
    .is('delivered_at', null)
    .select('id');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, updated: data?.length ?? 0 });
}
