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
import { MESSAGE_BODY_MAX_LENGTH } from '@/lib/constants/limits';

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

async function getOrCreateChat(supabase: SupabaseClient, connectionId: string) {
  const { data: existing, error: findErr } = await supabase
    .from('chats')
    .select('*')
    .eq('connection_id', connectionId)
    .limit(1)
    .maybeSingle();

  if (findErr) throw findErr;
  if (existing) return existing;

  const now = Date.now();
  const { data: created, error: createErr } = await supabase
    .from('chats')
    .insert({ connection_id: connectionId, created_at: now, updated_at: now })
    .select()
    .single();

  if (createErr) throw createErr;
  return created;
}

async function resolveChatId(
  supabase: SupabaseClient,
  chatId?: string | null,
  connectionId?: string | null
) {
  if (chatId) {
    const { data: existing, error } = await supabase
      .from('chats')
      .select('id')
      .eq('id', chatId)
      .maybeSingle();

    if (error) throw error;
    if (existing?.id) return existing.id as string;
  }

  if (!connectionId) return null;
  const chat = await getOrCreateChat(supabase, connectionId);
  return chat.id as string;
}

const DEFAULT_LIMIT = 40;

function enforceMessageBodyLength(content: string, isE2EPayload: boolean): NextResponse | null {
  if (isE2EPayload || content.length <= MESSAGE_BODY_MAX_LENGTH) {
    return null;
  }
  return NextResponse.json(
    { error: `Message must be at most ${MESSAGE_BODY_MAX_LENGTH} characters` },
    { status: 400 },
  );
}

export async function GET(req: NextRequest) {
  const chatId = req.nextUrl.searchParams.get('chatId');
  const cursor = req.nextUrl.searchParams.get('cursor'); // time_created of oldest loaded msg
  const limit = parseInt(req.nextUrl.searchParams.get('limit') ?? String(DEFAULT_LIMIT), 10);

  if (!chatId) {
    return NextResponse.json({ error: 'chatId is required' }, { status: 400 });
  }

  const { user, supabase } = await getAuthenticatedSupabase(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

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
    await supabase
      .from('messages')
      .update({ is_read: true })
      .in('id', unreadIds);
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
  const { chatId, connectionId, content, message_type: rawMessageType, metadata } = body;
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

  const { user, supabase, token } = await getAuthenticatedSupabase(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const resolvedChatId = await resolveChatId(supabase, chatId, connectionId);
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

    const lengthErr = enforceMessageBodyLength(wireContent, wireContent.startsWith('e2e:'));
    if (lengthErr) return lengthErr;

    const insertRow = buildMessageInsertRow({
      chatId: resolvedChatId,
      userId: user.id,
      content: wireContent,
      now,
      messageType,
      metadata,
    });

    let { data: message, error: insertErr } = await supabase.from('messages').insert(insertRow).select().single();

    if (insertErr && connectionId) {
      const ensuredChat = await getOrCreateChat(supabase, connectionId);
      if (ensuredChat.id !== resolvedChatId) {
        const retried = await supabase
          .from('messages')
          .insert({ ...insertRow, chat_id: ensuredChat.id as string })
          .select()
          .single();

        message = retried.data;
        insertErr = retried.error;
      }
    }

    if (insertErr) {
      console.error('Message insert failed', {
        chatId,
        connectionId,
        userId: user.id,
        error: insertErr.message,
      });
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    await supabase
      .from('chats')
      .update({ updated_at: now })
      .eq('id', message.chat_id);

    if (messageType !== 'call_log') {
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
      { status: 201 }
    );
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Failed to send message' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { messageId, content } = body;

  if (!messageId || !content?.trim()) {
    return NextResponse.json({ error: 'messageId and content are required' }, { status: 400 });
  }

  const { user, supabase } = await getAuthenticatedSupabase(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const wireContent = typeof content === 'string' && content.startsWith('e2e:') ? content : content.trim();
  const patchLengthErr = enforceMessageBodyLength(wireContent, wireContent.startsWith('e2e:'));
  if (patchLengthErr) return patchLengthErr;

  const { data: message, error } = await supabase
    .from('messages')
    .update({ content: wireContent, time_edited: Date.now() })
    .eq('id', messageId)
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
