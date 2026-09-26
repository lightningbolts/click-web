/**
 * GET  /api/chat/messages?chatId=<uuid>&cursor=<time_created>&limit=<n>&aroundMessageId=<uuid>
 * Returns paginated messages (newest first) with their reactions.
 * `aroundMessageId` loads a window centered on that row for search deep-links.
 *
 * POST /api/chat/messages
 * Body: { chatId?: string; connectionId?: string; content: string; message_type?: string;
 *         metadata?: object; local_sent_at?: number }
 * Sends a new message (optional `local_sent_at` ms epoch from the device clock).
 *
 * PATCH /api/chat/messages
 * Body: { messageId: string; content: string }
 * Edits an existing message (owner only).
 *
 * DELETE /api/chat/messages?messageId=<uuid>
 * Deletes a message (owner only).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedSupabase } from '@/lib/server/supabaseAuth';
import { normalizeDbMessage } from '@/lib/chat/messages';
import { mergeAroundTargetMessages } from '@/lib/chat/aroundMessage';
import {
  assertChatWritable,
  createChatGatekeeperAdmin,
  requireBearerUser,
} from '@/lib/server/chatGatekeeper';
import { parseBody } from '@/lib/api/parseBody';
import { chatMessagePatchBodySchema } from '@/lib/api/schemas/chat';
import { insertChatMessage, prepareChatMessageWrite } from '@/lib/server/chatMessageWrite';
import {
  assertE2eeV2MessageWrite,
  assertE2eeV2MediaMessageWrite,
  messageBodyV2Field,
} from '@/lib/server/e2eeV2Gate';

const DEFAULT_LIMIT = 40;

export async function GET(req: NextRequest) {
  const chatId = req.nextUrl.searchParams.get('chatId');
  const cursor = req.nextUrl.searchParams.get('cursor'); // time_created of oldest loaded msg
  const aroundMessageId = req.nextUrl.searchParams.get('aroundMessageId')?.trim() || null;
  // Delta sync: rows newer than the client's newest stored message (time_created, ms).
  const sinceRaw = req.nextUrl.searchParams.get('since');
  const since = sinceRaw != null && /^\d+$/.test(sinceRaw) ? parseInt(sinceRaw, 10) : null;
  const limit = parseInt(req.nextUrl.searchParams.get('limit') ?? String(DEFAULT_LIMIT), 10);

  if (!chatId) {
    return NextResponse.json({ error: 'chatId is required' }, { status: 400 });
  }

  const { user, supabase } = await getAuthenticatedSupabase(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Gatekeeper check ensures this endpoint is safe even when read-marking uses admin updates.
  const admin = createChatGatekeeperAdmin();
  const denied = await assertChatWritable(admin, user.id, chatId);
  if (denied) return denied;

  let messages: Record<string, unknown>[] | null = null;

  if (aroundMessageId) {
    const { data: target, error: targetErr } = await supabase
      .from('messages')
      .select('*')
      .eq('chat_id', chatId)
      .eq('id', aroundMessageId)
      .maybeSingle();
    if (targetErr) return NextResponse.json({ error: targetErr.message }, { status: 500 });
    if (target && typeof target.time_created === 'number') {
      const { data: older, error: olderErr } = await supabase
        .from('messages')
        .select('*')
        .eq('chat_id', chatId)
        .lte('time_created', target.time_created)
        .order('time_created', { ascending: false })
        .limit(limit);
      if (olderErr) return NextResponse.json({ error: olderErr.message }, { status: 500 });
      const { data: newer, error: newerErr } = await supabase
        .from('messages')
        .select('*')
        .eq('chat_id', chatId)
        .gt('time_created', target.time_created)
        .order('time_created', { ascending: true })
        .limit(Math.min(40, limit));
      if (newerErr) return NextResponse.json({ error: newerErr.message }, { status: 500 });
      const merged = mergeAroundTargetMessages(
        (older ?? []) as Array<{ id: string; time_created: number }>,
        (newer ?? []) as Array<{ id: string; time_created: number }>,
        target as { id: string; time_created: number },
      );
      merged.sort((a, b) => Number(b.time_created) - Number(a.time_created));
      messages = merged;
    }
  }

  if (!messages && since != null) {
    // Oldest-first so a capped page never skips the gap right after `since`; returned
    // newest-first like every other mode.
    const { data, error: sinceErr } = await supabase
      .from('messages')
      .select('*')
      .eq('chat_id', chatId)
      .gt('time_created', since)
      .order('time_created', { ascending: true })
      .limit(Math.min(Math.max(limit, 1), 200));
    if (sinceErr) return NextResponse.json({ error: sinceErr.message }, { status: 500 });
    messages = ((data ?? []) as Record<string, unknown>[]).reverse();
  }

  if (!messages) {
    let query = supabase
      .from('messages')
      .select('*')
      .eq('chat_id', chatId)
      .order('time_created', { ascending: false })
      .limit(limit);

    if (cursor) {
      query = query.lt('time_created', parseInt(cursor, 10));
    }

    const { data, error: msgErr } = await query;
    if (msgErr) return NextResponse.json({ error: msgErr.message }, { status: 500 });
    messages = (data ?? []) as Record<string, unknown>[];
  }

  if (!messages || messages.length === 0) {
    if (since != null && req.nextUrl.searchParams.get('include_tombstones') === '1') {
      // A delta with no new rows can still carry deletions of older messages.
      const { data: tombstones } = await admin
        .from('message_tombstones')
        .select('message_id, user_id, time_created, deleted_at')
        .eq('chat_id', chatId)
        .gt('deleted_at', new Date(since).toISOString())
        .limit(100);
      return NextResponse.json({ messages: [], tombstones: tombstones ?? [] });
    }
    return NextResponse.json({ messages: [] });
  }

  // Reactions and receipt acknowledgements are independent once the message page is known.
  // Issue them together so a normal chat read does not serialize three Supabase round-trips.
  const messageIds = messages.map((m: any) => m.id);
  const reactionsPromise = supabase
    .from('message_reactions')
    .select('*')
    .in('message_id', messageIds);

  const unreadIds = messages
    .filter((m: any) => m.user_id !== user.id && !m.is_read)
    .map((m: any) => m.id);
  const readPromise =
    unreadIds.length > 0
      ? admin
          .from('messages')
          .update({ is_read: true, read_at: Date.now() })
          .in('id', unreadIds)
      : Promise.resolve({ error: null });

  // Recipient has loaded these rows on this device — mirror PATCH /messages/delivered (covers
  // pagination and any missed client-side acks).
  const deliveredIds = messages
    .filter(
      (m: any) =>
        m.user_id !== user.id &&
        (m.delivered_at == null || m.delivered_at === undefined),
    )
    .map((m: any) => String(m.id));
  const deliveredPromise =
    deliveredIds.length > 0
      ? admin
          .from('messages')
          .update({ delivered_at: Date.now() })
          .eq('chat_id', chatId)
          .in('id', deliveredIds)
          .neq('user_id', user.id)
          .is('delivered_at', null)
      : Promise.resolve({ error: null });

  const [
    { data: reactions, error: reactionErr },
    { error: markErr },
    { error: deliveredErr },
  ] = await Promise.all([reactionsPromise, readPromise, deliveredPromise]);

  if (reactionErr) {
    console.error('Reaction fetch error:', reactionErr.message);
  }
  if (markErr) {
    console.error('mark read failed in /api/chat/messages GET:', markErr.message);
  }
  if (deliveredErr) {
    console.error('mark delivered failed in /api/chat/messages GET:', deliveredErr.message);
  }

  // Group reactions onto messages
  const reactionMap: Record<string, Record<string, any[]>> = {};
  (reactions ?? []).forEach((r: any) => {
    if (!reactionMap[r.message_id]) reactionMap[r.message_id] = {};
    if (!reactionMap[r.message_id][r.reaction_type]) reactionMap[r.message_id][r.reaction_type] = [];
    reactionMap[r.message_id][r.reaction_type].push(r);
  });

  const enriched = messages.map((m: Record<string, unknown>) =>
    normalizeDbMessage({
      ...m,
      reactions: reactionMap[String(m.id)] ?? {},
    })
  );

  // Opt-in "Message deleted" placeholders inside the returned window (older clients never ask,
  // so their behavior is unchanged).
  if (req.nextUrl.searchParams.get('include_tombstones') === '1') {
    const times = messages.map((m: any) => Number(m.time_created)).filter((t: number) => Number.isFinite(t));
    let query = admin
      .from('message_tombstones')
      .select('message_id, user_id, time_created, deleted_at')
      .eq('chat_id', chatId)
      .order('time_created', { ascending: false })
      .limit(100);
    if (since != null) {
      query = query.gt('deleted_at', new Date(since).toISOString());
    } else if (times.length > 0) {
      query = query.gte('time_created', Math.min(...times));
    }
    const { data: tombstones, error: tombErr } = await query;
    if (tombErr) console.warn('tombstones read failed in /api/chat/messages GET:', tombErr.message);
    return NextResponse.json({ messages: enriched, tombstones: tombstones ?? [] });
  }

  return NextResponse.json({ messages: enriched });
}

export async function POST(req: NextRequest) {
  const prepared = await prepareChatMessageWrite(req);
  if (prepared instanceof NextResponse) return prepared;
  try {
    const result = await insertChatMessage(createChatGatekeeperAdmin(), prepared, Date.now(), prepared.bearer);
    if ('error' in result) return NextResponse.json({ error: result.error }, { status: 500 });
    return NextResponse.json(
      { message: normalizeDbMessage({ ...result.message, reactions: {} }) },
      { status: 201 },
    );
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Failed to send message' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const parsed = await parseBody(req, chatMessagePatchBodySchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
  const messageId = typeof body.messageId === 'string' ? body.messageId : '';
  const chatIdBody = typeof body.chat_id === 'string' ? body.chat_id : '';
  const content = typeof body.content === 'string' ? body.content : '';
  const metadata =
    body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata)
      ? (body.metadata as Record<string, unknown>)
      : undefined;

  if (!messageId || !content.trim()) {
    return NextResponse.json({ error: 'messageId and content are required' }, { status: 400 });
  }

  const jwt = await requireBearerUser(req);
  if (!jwt.ok) return jwt.response;
  const { user } = jwt;

  let admin;
  try {
    admin = createChatGatekeeperAdmin();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Chat admin unavailable';
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const { data: row, error: fetchErr } = await admin
    .from('messages')
    .select('id, chat_id, user_id, message_type, metadata')
    .eq('id', messageId.trim())
    .maybeSingle();

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 400 });
  }
  if (!row) {
    return NextResponse.json({ error: 'Message not found' }, { status: 404 });
  }
  if (row.user_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const effectiveChatId = (chatIdBody || row.chat_id) as string;
  const denied = await assertChatWritable(admin, user.id, effectiveChatId);
  if (denied) return denied;

  if (String(row.chat_id) !== String(effectiveChatId)) {
    return NextResponse.json({ error: 'chatId does not match message' }, { status: 400 });
  }

  const effectiveMetadata =
    metadata ?? (row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, unknown>)
      : {});

  const v2Gate = await assertE2eeV2MessageWrite(admin, {
    chatId: String(effectiveChatId),
    requestedChatId: chatIdBody || undefined,
    userId: user.id,
    content,
    epoch: messageBodyV2Field(body as Record<string, unknown>, 'epoch', 'epoch', effectiveMetadata),
    senderDeviceId: messageBodyV2Field(
      body as Record<string, unknown>,
      'sender_device_id',
      'senderDeviceId',
      effectiveMetadata,
    ),
    clientMessageId: messageBodyV2Field(
      body as Record<string, unknown>,
      'client_message_id',
      'clientMessageId',
      effectiveMetadata,
    ),
    allowLegacy: row.message_type === 'call_log' || row.message_type === 'beacon',
  });
  if (!v2Gate.ok) return v2Gate.response;

  if (
    content.startsWith('e2e2:') &&
    (row.message_type === 'image' || row.message_type === 'audio' || row.message_type === 'file')
  ) {
    if (!v2Gate.envelope) return NextResponse.json({ error: 'Invalid E2EE v2 message envelope' }, { status: 400 });
    const mediaMessageGate = assertE2eeV2MediaMessageWrite({
      chatId: String(effectiveChatId),
      userId: user.id,
      messageEnvelope: v2Gate.envelope,
      metadata: effectiveMetadata,
    });
    if (!mediaMessageGate.ok) return mediaMessageGate.response;
  }

  const wireContent = content.startsWith('e2e:') ? content : content.trim();
  const update: Record<string, unknown> = { content: wireContent, time_edited: Date.now() };
  if (metadata !== undefined) update.metadata = metadata;
  const { data: message, error } = await admin
    .from('messages')
    .update(update)
    .eq('id', messageId.trim())
    .eq('user_id', user.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({
    message: normalizeDbMessage(message as Record<string, unknown>),
  });
}

export async function DELETE(req: NextRequest) {
  const messageId = req.nextUrl.searchParams.get('messageId');
  if (!messageId) {
    return NextResponse.json({ error: 'messageId is required' }, { status: 400 });
  }

  const { user, supabase } = await getAuthenticatedSupabase(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Capture placement before the (unchanged) hard delete so a tombstone can be shown.
  const { data: existing } = await supabase
    .from('messages')
    .select('id, chat_id, user_id, time_created')
    .eq('id', messageId)
    .eq('user_id', user.id)
    .maybeSingle();

  const { error } = await supabase
    .from('messages')
    .delete()
    .eq('id', messageId)
    .eq('user_id', user.id); // ensure ownership

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (existing && typeof (existing as any).chat_id === 'string') {
    const row = existing as { id: string; chat_id: string; user_id: string; time_created: number | string };
    const { error: tombErr } = await createChatGatekeeperAdmin()
      .from('message_tombstones')
      .upsert({
        message_id: row.id,
        chat_id: row.chat_id,
        user_id: row.user_id,
        time_created: Number(row.time_created) || Date.now(),
      }, { onConflict: 'message_id' });
    if (tombErr) console.warn('tombstone write failed in /api/chat/messages DELETE:', tombErr.message);
  }
  return NextResponse.json({ success: true });
}
