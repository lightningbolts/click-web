/**
 * GET /api/chat/search?q=<query>
 * Message hits across 1:1 chats, group cliques, and hub rooms the caller can access.
 * Encrypted 1:1/group bodies will not match server-side; the dashboard also searches
 * a decrypted recent page per conversation.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedSupabase } from '@/lib/server/supabaseAuth';
import { createChatGatekeeperAdmin } from '@/lib/server/chatGatekeeper';
import { escapeIlikePattern, highlightedMessageSnippet, type ChatSearchHit } from '@/lib/chat/searchSnippet';

const MIN_QUERY = 2;
const MAX_CHAT_HITS = 40;
const MAX_HUB_HITS = 20;

function hubCreatedAtToMs(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const ms = Date.parse(value);
    if (Number.isFinite(ms)) return ms;
  }
  return 0;
}

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim();
  if (q.length < MIN_QUERY) {
    return NextResponse.json({ hits: [] as ChatSearchHit[] });
  }

  const { user, supabase } = await getAuthenticatedSupabase(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const pattern = `%${escapeIlikePattern(q)}%`;
  const hits: ChatSearchHit[] = [];

  try {
    const { data: connections, error: connErr } = await supabase
      .from('connections')
      .select('id')
      .contains('user_ids', [user.id]);
    if (connErr) {
      console.error('[chat/search] connections:', connErr.message);
    }
    const connectionIds = (connections ?? [])
      .map((row) => (typeof row.id === 'string' ? row.id : ''))
      .filter(Boolean);

    const { data: memberships, error: memErr } = await supabase
      .from('group_members')
      .select('group_id')
      .eq('user_id', user.id);
    if (memErr) {
      console.error('[chat/search] group_members:', memErr.message);
    }
    const groupIds = (memberships ?? [])
      .map((row) => (typeof row.group_id === 'string' ? row.group_id : ''))
      .filter(Boolean);

    const chatRows: { id: string; connection_id: string | null; group_id: string | null }[] = [];
    if (connectionIds.length > 0) {
      const { data, error } = await supabase
        .from('chats')
        .select('id, connection_id, group_id')
        .in('connection_id', connectionIds);
      if (error) {
        console.error('[chat/search] chats by connection:', error.message);
      } else {
        for (const row of data ?? []) {
          if (typeof row.id === 'string') {
            chatRows.push({
              id: row.id,
              connection_id: typeof row.connection_id === 'string' ? row.connection_id : null,
              group_id: typeof row.group_id === 'string' ? row.group_id : null,
            });
          }
        }
      }
    }
    if (groupIds.length > 0) {
      const { data, error } = await supabase
        .from('chats')
        .select('id, connection_id, group_id')
        .in('group_id', groupIds);
      if (error) {
        console.error('[chat/search] chats by group:', error.message);
      } else {
        const seen = new Set(chatRows.map((c) => c.id));
        for (const row of data ?? []) {
          if (typeof row.id === 'string' && !seen.has(row.id)) {
            chatRows.push({
              id: row.id,
              connection_id: typeof row.connection_id === 'string' ? row.connection_id : null,
              group_id: typeof row.group_id === 'string' ? row.group_id : null,
            });
          }
        }
      }
    }

    const chatById = new Map(chatRows.map((c) => [c.id, c]));
    const chatIds = chatRows.map((c) => c.id);
    if (chatIds.length > 0) {
      const { data: messages, error: msgErr } = await supabase
        .from('messages')
        .select('id, chat_id, user_id, content, time_created')
        .in('chat_id', chatIds)
        .ilike('content', pattern)
        .order('time_created', { ascending: false })
        .limit(MAX_CHAT_HITS);
      if (msgErr) {
        console.error('[chat/search] messages:', msgErr.message);
      } else {
        const groupNameIds = [
          ...new Set(
            chatRows
              .map((c) => c.group_id)
              .filter((id): id is string => typeof id === 'string' && id.length > 0),
          ),
        ];
        const groupNames = new Map<string, string>();
        if (groupNameIds.length > 0) {
          const { data: groups } = await supabase.from('groups').select('id, name').in('id', groupNameIds);
          for (const g of groups ?? []) {
            if (typeof g.id === 'string' && typeof g.name === 'string') {
              groupNames.set(g.id, g.name);
            }
          }
        }
        for (const row of messages ?? []) {
          const chatId = typeof row.chat_id === 'string' ? row.chat_id : '';
          const chat = chatById.get(chatId);
          if (!chat) continue;
          const content = typeof row.content === 'string' ? row.content : '';
          const conversationId = chat.group_id ?? chat.connection_id ?? chatId;
          hits.push({
            messageId: String(row.id),
            chatId,
            conversationId,
            connectionId: chat.connection_id ?? chat.group_id ?? chatId,
            senderId: typeof row.user_id === 'string' ? row.user_id : '',
            timestamp: Number(row.time_created) || 0,
            snippet: highlightedMessageSnippet(content, q),
            chatName: chat.group_id ? (groupNames.get(chat.group_id) ?? 'Clique') : 'Chat',
            isHub: false,
          });
        }
      }
    }

    try {
      const admin = createChatGatekeeperAdmin();
      const { data: parts, error: partErr } = await admin
        .from('hub_participants')
        .select('hub_id')
        .eq('user_id', user.id);
      if (partErr) {
        console.error('[chat/search] hub_participants:', partErr.message);
      } else {
        const hubIds = (parts ?? [])
          .map((row) => (typeof row.hub_id === 'string' ? row.hub_id : ''))
          .filter(Boolean);
        if (hubIds.length > 0) {
          const { data: hubMsgs, error: hubErr } = await admin
            .from('hub_messages')
            .select('id, hub_id, user_id, body, created_at')
            .in('hub_id', hubIds)
            .ilike('body', pattern)
            .order('created_at', { ascending: false })
            .limit(MAX_HUB_HITS);
          if (hubErr) {
            console.error('[chat/search] hub_messages:', hubErr.message);
          } else {
            const { data: venues } = await admin
              .from('hub_venues')
              .select('id, name')
              .in('id', hubIds);
            const hubNames = new Map<string, string>();
            for (const v of venues ?? []) {
              if (typeof v.id === 'string' && typeof v.name === 'string') {
                hubNames.set(v.id, v.name);
              }
            }
            for (const row of hubMsgs ?? []) {
              const hubId = typeof row.hub_id === 'string' ? row.hub_id : '';
              const body = typeof row.body === 'string' ? row.body : '';
              hits.push({
                messageId: String(row.id),
                chatId: hubId,
                conversationId: hubId,
                connectionId: hubId,
                senderId: typeof row.user_id === 'string' ? row.user_id : '',
                timestamp: hubCreatedAtToMs(row.created_at),
                snippet: highlightedMessageSnippet(body, q),
                chatName: hubNames.get(hubId) ?? 'Hub',
                isHub: true,
                hubId,
              });
            }
          }
        }
      }
    } catch (err) {
      console.error('[chat/search] hub lookup skipped:', err);
    }

    hits.sort((a, b) => b.timestamp - a.timestamp);
    return NextResponse.json({ hits: hits.slice(0, MAX_CHAT_HITS + MAX_HUB_HITS) });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Search failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
