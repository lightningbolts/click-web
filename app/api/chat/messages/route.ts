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
import { type SupabaseClient } from '@supabase/supabase-js';
import { getAuthenticatedSupabase } from '@/lib/server/supabaseAuth';
import { buildMessageInsertRow, normalizeDbMessage, parseLocalSentAtMs } from '@/lib/chat/messages';
import { mergeAroundTargetMessages } from '@/lib/chat/aroundMessage';
import type { MessageType } from '@/lib/chat/types';
import {
  assertChatWritable,
  createChatGatekeeperAdmin,
  requireBearerUser,
} from '@/lib/server/chatGatekeeper';
import { isActiveChatListStatus, normalizeConnectionStatus } from '@/lib/dashboard/connectionStatus';
import { runtimeEnv } from '@/lib/server/runtimeEnv';
import { parseBody } from '@/lib/api/parseBody';
import { chatMessagePatchBodySchema, chatMessagePostBodySchema } from '@/lib/api/schemas/chat';

const CHAT_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function chatPushFunctionUrl(): string | null {
  const base = runtimeEnv('NEXT_PUBLIC_SUPABASE_URL');
  return base ? `${base}/functions/v1/send-push-notification` : null;
}

async function notifyChatMessagePush(token: string | null, chatId: string, messageId: string, senderUserId: string) {
  const pushFunctionUrl = chatPushFunctionUrl();
  if (!token || !pushFunctionUrl) return;

  const response = await fetch(pushFunctionUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      data: {
        type: 'chat_message',
        chat_id: chatId,
        message_id: messageId,
        sender_user_id: senderUserId,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`send-push-notification returned ${response.status}: ${errorText}`);
  }
}

async function getOrCreateChatAdmin(admin: SupabaseClient, connectionId: string) {
  const { data: existing, error: findErr } = await admin
    .from('chats')
    .select('*')
    .eq('connection_id', connectionId)
    .limit(1)
    .maybeSingle();

  if (findErr) throw findErr;
  if (existing) return existing;

  const now = Date.now();
  const { data: created, error: createErr } = await admin
    .from('chats')
    .insert({ connection_id: connectionId, created_at: now, updated_at: now })
    .select()
    .single();

  if (createErr) throw createErr;
  return created;
}

const DEFAULT_LIMIT = 40;

export async function GET(req: NextRequest) {
  const chatId = req.nextUrl.searchParams.get('chatId');
  const cursor = req.nextUrl.searchParams.get('cursor'); // time_created of oldest loaded msg
  const aroundMessageId = req.nextUrl.searchParams.get('aroundMessageId')?.trim() || null;
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
    return NextResponse.json({ messages: [] });
  }

  // Bulk-fetch reactions for all returned messages
  const messageIds = messages.map((m: any) => m.id);
  const { data: reactions, error: reactionErr } = await supabase
    .from('message_reactions')
    .select('*')
    .in('message_id', messageIds);

  if (reactionErr) {
    console.error('Reaction fetch error:', reactionErr.message);
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

  // Mark messages from the other user as read
  const unreadIds = messages
    .filter((m: any) => m.user_id !== user.id && !m.is_read)
    .map((m: any) => m.id);

  if (unreadIds.length > 0) {
    const readStamp = Date.now();
    const { error: markErr } = await admin
      .from('messages')
      .update({ is_read: true, read_at: readStamp })
      .in('id', unreadIds);
    if (markErr) {
      console.error('mark read failed in /api/chat/messages GET:', markErr.message);
    }
  }

  // Recipient has loaded these rows on this device — mirror PATCH /messages/delivered (covers
  // pagination and any missed client-side acks).
  const deliveredIds = messages
    .filter(
      (m: any) =>
        m.user_id !== user.id &&
        (m.delivered_at == null || m.delivered_at === undefined),
    )
    .map((m: any) => String(m.id));

  if (deliveredIds.length > 0) {
    const deliveredStamp = Date.now();
    const { error: deliveredErr } = await admin
      .from('messages')
      .update({ delivered_at: deliveredStamp })
      .eq('chat_id', chatId)
      .in('id', deliveredIds)
      .neq('user_id', user.id)
      .is('delivered_at', null);
    if (deliveredErr) {
      console.error('mark delivered failed in /api/chat/messages GET:', deliveredErr.message);
    }
  }

  return NextResponse.json({ messages: enriched });
}

function parsePostMessageType(raw: unknown): MessageType {
  const s = typeof raw === 'string' ? raw.toLowerCase() : '';
  if (s === 'call_log') return 'call_log';
  if (s === 'beacon') return 'beacon';
  if (s === 'image') return 'image';
  if (s === 'audio') return 'audio';
  if (s === 'file') return 'file';
  return 'text';
}

export async function POST(req: NextRequest) {
  const parsed = await parseBody(req, chatMessagePostBodySchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
  const chatId = typeof body.chat_id === 'string' ? body.chat_id : '';
  const connectionId = typeof body.connection_id === 'string' ? body.connection_id : '';
  const { content, metadata } = body;
  const rawMessageType =
    (body as Record<string, unknown>).message_type ??
    (body as Record<string, unknown>).messageType;
  let messageType = parsePostMessageType(rawMessageType);
  const meta =
    metadata && typeof metadata === 'object' && !Array.isArray(metadata)
      ? (metadata as Record<string, unknown>)
      : {};
  // Infer beacon when clients send structured beacon metadata under message_type=text.
  if (
    messageType === 'text' &&
    (typeof meta.beacon_id === 'string' || typeof meta.beaconId === 'string')
  ) {
    messageType = 'beacon';
  }
  const isCallLog = messageType === 'call_log';
  const isBeacon = messageType === 'beacon';
  const isMedia = messageType === 'image' || messageType === 'audio';

  if (!chatId && !connectionId) {
    return NextResponse.json({ error: 'chatId or connectionId is required' }, { status: 400 });
  }

  const mediaUrl = typeof meta.media_url === 'string' ? meta.media_url.trim() : '';

  if (isCallLog || isBeacon) {
    // call_log / beacon rows may use empty or short plaintext content + metadata
  } else if (isMedia) {
    if (!mediaUrl) {
      return NextResponse.json(
        { error: 'metadata.media_url is required for image and audio messages' },
        { status: 400 },
      );
    }
  } else {
    const c = typeof content === 'string' ? content : '';
    if (!c.trim()) {
      return NextResponse.json({ error: 'chatId or connectionId and content are required' }, { status: 400 });
    }
  }

  const jwt = await requireBearerUser(req);
  if (!jwt.ok) return jwt.response;
  const { user, bearer: token } = jwt;

  try {
    const admin = createChatGatekeeperAdmin();
    let resolvedChatId: string | null = null;
    const trimmedChatId = chatId.trim();
    const trimmedConnectionId = connectionId.trim();

    // Reject optimistic/temp client ids (e.g. temp-…) — fall through to connection_id.
    // If a UUID chat_id is stale/missing, also fall through when connection_id is present
    // (avoids "Chat not found" while the user is already inside the thread).
    if (trimmedChatId && CHAT_UUID_RE.test(trimmedChatId)) {
      const denied = await assertChatWritable(admin, user.id, trimmedChatId);
      if (!denied) {
        resolvedChatId = trimmedChatId;
      } else if (!trimmedConnectionId) {
        return denied;
      } else if (denied.status !== 404) {
        return denied;
      }
    }

    if (!resolvedChatId && trimmedConnectionId) {
      const { data: conn, error: connErr } = await admin
        .from('connections')
        .select('id, user_ids, status, expiry_state')
        .eq('id', trimmedConnectionId)
        .maybeSingle();

      if (connErr) throw connErr;
      const ids =
        (conn?.user_ids as string[] | null)?.map((id) => id.trim()).filter((id) => id.length > 0) ?? [];
      if (!conn || !ids.includes(user.id)) {
        return NextResponse.json({ error: 'Connection not found' }, { status: 404 });
      }
      const st = normalizeConnectionStatus(conn as Record<string, unknown>);
      if (!isActiveChatListStatus(st)) {
        return NextResponse.json({ error: 'Connection not active for chat' }, { status: 403 });
      }

      const chat = await getOrCreateChatAdmin(admin, trimmedConnectionId);
      resolvedChatId = chat.id as string;
    }

    if (!resolvedChatId) {
      return NextResponse.json({ error: 'Chat not found' }, { status: 404 });
    }

    const now = Date.now();
    const localSentAtMs = parseLocalSentAtMs(
      (body as Record<string, unknown>).local_sent_at ?? (body as Record<string, unknown>).localSentAt,
    );
    const rawContent = typeof content === 'string' ? content : '';
    const wireContent = rawContent.startsWith('e2e:')
      ? rawContent
      : isCallLog
        ? rawContent
        : isMedia
          ? rawContent.trim()
          : rawContent.trim();

    const insertRow = buildMessageInsertRow({
      chatId: resolvedChatId,
      userId: user.id,
      content: wireContent,
      now,
      messageType,
      metadata,
      localSentAtMs,
    });

    const { data: message, error: insertErr } = await admin.from('messages').insert(insertRow).select().single();

    if (insertErr) {
      console.error('Message insert failed', {
        chatId,
        connectionId,
        userId: user.id,
        error: insertErr.message,
      });
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    await admin.from('chats').update({ updated_at: now }).eq('id', message.chat_id);

    const skipPushForEncryptedMedia =
      isMedia && (meta.is_encrypted_media === true || meta.is_encrypted_media === 'true');

    if (messageType !== 'call_log' && !skipPushForEncryptedMedia) {
      try {
        await notifyChatMessagePush(token, message.chat_id, message.id, user.id);
      } catch (pushError) {
        console.error('Chat push dispatch failed', {
          chatId: message.chat_id,
          messageId: message.id,
          userId: user.id,
          error: pushError instanceof Error ? pushError.message : String(pushError),
        });
      }
    }

    return NextResponse.json(
      { message: normalizeDbMessage({ ...(message as Record<string, unknown>), reactions: {} }) },
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
    .select('id, chat_id, user_id')
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

  const wireContent = content.startsWith('e2e:') ? content : content.trim();
  const { data: message, error } = await admin
    .from('messages')
    .update({ content: wireContent, time_edited: Date.now() })
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

  const { error } = await supabase
    .from('messages')
    .delete()
    .eq('id', messageId)
    .eq('user_id', user.id); // ensure ownership

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
