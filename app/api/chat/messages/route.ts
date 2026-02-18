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
import { createClient } from '@supabase/supabase-js';

async function getAuthUser(req: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
  });

  const authCookie =
    req.cookies.get('sb-access-token') ||
    req.cookies.get('sb-lrgcwnmcscimkmslihxp-auth-token');

  const authHeader = req.headers.get('Authorization');
  const token = authCookie?.value ?? authHeader?.replace('Bearer ', '');

  if (!token) return { user: null, supabase };

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return { user: null, supabase };
  return { user, supabase };
}

const DEFAULT_LIMIT = 40;

export async function GET(req: NextRequest) {
  const chatId = req.nextUrl.searchParams.get('chatId');
  const cursor = req.nextUrl.searchParams.get('cursor'); // time_created of oldest loaded msg
  const limit = parseInt(req.nextUrl.searchParams.get('limit') ?? String(DEFAULT_LIMIT), 10);

  if (!chatId) {
    return NextResponse.json({ error: 'chatId is required' }, { status: 400 });
  }

  const { user, supabase } = await getAuthUser(req);
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
  const { chatId, content } = body;

  if (!chatId || !content?.trim()) {
    return NextResponse.json({ error: 'chatId and content are required' }, { status: 400 });
  }

  const { user, supabase } = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const now = Date.now();
  const { data: message, error: insertErr } = await supabase
    .from('messages')
    .insert({
      chat_id: chatId,
      user_id: user.id,
      content: content.trim(),
      time_created: now,
    })
    .select()
    .single();

  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });

  // Update chat's updated_at timestamp
  await supabase
    .from('chats')
    .update({ updated_at: now })
    .eq('id', chatId);

  return NextResponse.json({ message: { ...message, reactions: {} } }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { messageId, content } = body;

  if (!messageId || !content?.trim()) {
    return NextResponse.json({ error: 'messageId and content are required' }, { status: 400 });
  }

  const { user, supabase } = await getAuthUser(req);
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

  const { user, supabase } = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { error } = await supabase
    .from('messages')
    .delete()
    .eq('id', messageId)
    .eq('user_id', user.id); // ensure ownership

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
