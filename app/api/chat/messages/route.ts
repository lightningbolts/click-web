/**
 * GET  /api/chat/messages?chatId=<uuid>&cursor=<time_created>&limit=<n>
 * Returns paginated messages (newest first) with their reactions.
 *
 * POST /api/chat/messages
 * Body: { chatId: string; content: string }
 * Sends a new message.
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
import { buildMessageInsertRow, normalizeDbMessage } from '@/lib/chat/messages';
import type { MessageType } from '@/lib/chat/types';
import {
  assertChatWritable,
  createChatGatekeeperAdmin,
  requireBearerUser,
} from '@/lib/server/chatGatekeeper';
import { isActiveChatListStatus, normalizeConnectionStatus } from '@/lib/dashboard/connectionStatus';

const pushFunctionUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-push-notification`
  : null;

async function notifyChatMessagePush(token: string | null, chatId: string, messageId: string, senderUserId: string) {
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

  // Build message query with optional cursor-based pagination
  let query = supabase
    .from('messages')
    .select('*')
    .eq('chat_id', chatId)
    .order('time_created', { ascending: false })
    .limit(limit);

  if (cursor) {
    query = query.lt('time_created', parseInt(cursor, 10));
  }

  const { data: messages, error: msgErr } = await query;
  if (msgErr) return NextResponse.json({ error: msgErr.message }, { status: 500 });

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
    const { error: markErr } = await admin
      .from('messages')
      .update({ is_read: true })
      .in('id', unreadIds);
    if (markErr) {
      console.error('mark read failed in /api/chat/messages GET:', markErr.message);
    }
  }

  return NextResponse.json({ messages: enriched });
}

function parsePostMessageType(raw: unknown): MessageType {
  const s = typeof raw === 'string' ? raw.toLowerCase() : '';
  if (s === 'call_log') return 'call_log';
  if (s === 'image') return 'image';
  if (s === 'audio') return 'audio';
  return 'text';
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const chatId =
    typeof body.chatId === 'string'
      ? body.chatId
      : typeof body.chat_id === 'string'
        ? body.chat_id
        : '';
  const connectionId = typeof body.connectionId === 'string' ? body.connectionId : typeof body.connection_id === 'string' ? body.connection_id : '';
  const { content, message_type: rawMessageType, metadata } = body;
  const messageType = parsePostMessageType(rawMessageType);
  const isCallLog = messageType === 'call_log';
  const isMedia = messageType === 'image' || messageType === 'audio';

  if (!chatId && !connectionId) {
    return NextResponse.json({ error: 'chatId or connectionId is required' }, { status: 400 });
  }

  const meta =
    metadata && typeof metadata === 'object' && !Array.isArray(metadata)
      ? (metadata as Record<string, unknown>)
      : {};
  const mediaUrl = typeof meta.media_url === 'string' ? meta.media_url.trim() : '';

  if (isCallLog) {
    // call_log rows may use empty content
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
  const admin = createChatGatekeeperAdmin();

  try {
    let resolvedChatId: string | null = null;

    if (chatId.trim()) {
      const denied = await assertChatWritable(admin, user.id, chatId.trim());
      if (denied) return denied;
      resolvedChatId = chatId.trim();
    } else if (connectionId.trim()) {
      const { data: conn, error: connErr } = await admin
        .from('connections')
        .select('id, user_ids, status, expiry_state')
        .eq('id', connectionId.trim())
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

      const chat = await getOrCreateChatAdmin(admin, connectionId.trim());
      resolvedChatId = chat.id as string;
    }

    if (!resolvedChatId) {
      return NextResponse.json({ error: 'Chat not found' }, { status: 404 });
    }

    const now = Date.now();
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
  const body = await req.json().catch(() => ({}));
  const messageId = typeof body.messageId === 'string' ? body.messageId : '';
  const chatIdBody = typeof body.chatId === 'string' ? body.chatId : typeof body.chat_id === 'string' ? body.chat_id : '';
  const { content } = body;

  if (!messageId || !content?.trim()) {
    return NextResponse.json({ error: 'messageId and content are required' }, { status: 400 });
  }

  const jwt = await requireBearerUser(req);
  if (!jwt.ok) return jwt.response;
  const { user } = jwt;
  const admin = createChatGatekeeperAdmin();

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

  const wireContent = typeof content === 'string' && content.startsWith('e2e:') ? content : content.trim();
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
