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

  const enriched = messages.map((m: any) => ({
    ...m,
    reactions: reactionMap[m.id] ?? {},
  }));

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

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { chatId, connectionId, content } = body;

  if ((!chatId && !connectionId) || !content?.trim()) {
    return NextResponse.json({ error: 'chatId or connectionId and content are required' }, { status: 400 });
  }

  const { user, supabase } = await getAuthenticatedSupabase(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const resolvedChatId = await resolveChatId(supabase, chatId, connectionId);
    if (!resolvedChatId) {
      return NextResponse.json({ error: 'Chat not found' }, { status: 404 });
    }

    const now = Date.now();
    let { data: message, error: insertErr } = await supabase
      .from('messages')
      .insert({
        chat_id: resolvedChatId,
        user_id: user.id,
        content: content.trim(),
        time_created: now,
      })
      .select()
      .single();

    if (insertErr && connectionId) {
      const ensuredChat = await getOrCreateChat(supabase, connectionId);
      if (ensuredChat.id !== resolvedChatId) {
        const retried = await supabase
          .from('messages')
          .insert({
            chat_id: ensuredChat.id,
            user_id: user.id,
            content: content.trim(),
            time_created: now,
          })
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

    return NextResponse.json({ message: { ...message, reactions: {} } }, { status: 201 });
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

  const { data: message, error } = await supabase
    .from('messages')
    .update({ content: content.trim(), time_edited: Date.now() })
    .eq('id', messageId)
    .eq('user_id', user.id) // ensure ownership
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ message });
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
