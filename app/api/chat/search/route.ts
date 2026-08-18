/**
 * GET /api/chat/search?q=<query>
 * Message hits across 1:1 chats, group cliques, and hub rooms the caller can access.
 * Encrypted 1:1/group bodies will not match server-side; the dashboard also searches
 * a decrypted recent page per conversation. Mobile uses this as the primary remote
 * message scan so unified search does not N+1 PostgREST per conversation.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedSupabase } from '@/lib/server/supabaseAuth';
import { createChatGatekeeperAdmin } from '@/lib/server/chatGatekeeper';
import { escapeIlikePattern, type ChatSearchHit } from '@/lib/chat/searchSnippet';
import { selectInChunks } from '@/lib/chat/postgrestInChunks';
import { toDirectChatSearchHit, toHubChatSearchHit, isSearchablePlaintextBody, type ChatRow } from '@/lib/chat/serverMessageSearch';

const MIN_QUERY = 2;
const MAX_CHAT_HITS = 40;
const MAX_HUB_HITS = 20;

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

    const chatRows: ChatRow[] = [];
    const pushChat = (row: { id?: unknown; connection_id?: unknown; group_id?: unknown }) => {
      if (typeof row.id !== 'string') return;
      chatRows.push({
        id: row.id,
        connection_id: typeof row.connection_id === 'string' ? row.connection_id : null,
        group_id: typeof row.group_id === 'string' ? row.group_id : null,
      });
    };

    if (connectionIds.length > 0) {
      const rows = await selectInChunks(connectionIds, async (chunk) => {
        const { data, error } = await supabase
          .from('chats')
          .select('id, connection_id, group_id')
          .in('connection_id', chunk);
        if (error) {
          console.error('[chat/search] chats by connection:', error.message);
          return [];
        }
        return data ?? [];
      });
      for (const row of rows) pushChat(row);
    }
    if (groupIds.length > 0) {
      const seen = new Set(chatRows.map((c) => c.id));
      const rows = await selectInChunks(groupIds, async (chunk) => {
        const { data, error } = await supabase
          .from('chats')
          .select('id, connection_id, group_id')
          .in('group_id', chunk);
        if (error) {
          console.error('[chat/search] chats by group:', error.message);
          return [];
        }
        return data ?? [];
      });
      for (const row of rows) {
        if (typeof row.id === 'string' && !seen.has(row.id)) {
          seen.add(row.id);
          pushChat(row);
        }
      }
    }

    const chatById = new Map(chatRows.map((c) => [c.id, c]));
    const chatIds = chatRows.map((c) => c.id);
    if (chatIds.length > 0) {
      const messages = await selectInChunks(chatIds, async (chunk) => {
        const { data, error } = await supabase
          .from('messages')
          .select('id, chat_id, user_id, content, time_created')
          .in('chat_id', chunk)
          .not('content', 'like', 'e2e:%')
          .not('content', 'like', 'e2e_grp:%')
          .ilike('content', pattern)
          .order('time_created', { ascending: false })
          .limit(MAX_CHAT_HITS);
        if (error) {
          console.error('[chat/search] messages:', error.message);
          return [];
        }
        return data ?? [];
      });
      messages.sort((a, b) => Number(b.time_created) - Number(a.time_created));
      const bounded = messages.slice(0, MAX_CHAT_HITS);
      const groupNameIds = [
        ...new Set(
          chatRows
            .map((c) => c.group_id)
            .filter((id): id is string => typeof id === 'string' && id.length > 0),
        ),
      ];
      const groupNames = new Map<string, string>();
      if (groupNameIds.length > 0) {
        const groups = await selectInChunks(groupNameIds, async (chunk) => {
          const { data } = await supabase.from('groups').select('id, name').in('id', chunk);
          return data ?? [];
        });
        for (const g of groups) {
          if (typeof g.id === 'string' && typeof g.name === 'string') {
            groupNames.set(g.id, g.name);
          }
        }
      }
      for (const row of bounded) {
        const chatId = typeof row.chat_id === 'string' ? row.chat_id : '';
        const chat = chatById.get(chatId);
        if (!chat) continue;
        const content = typeof row.content === 'string' ? row.content : '';
        if (!isSearchablePlaintextBody(content)) continue;
        hits.push(
          toDirectChatSearchHit({
            messageId: String(row.id),
            chat,
            senderId: typeof row.user_id === 'string' ? row.user_id : '',
            timestamp: Number(row.time_created) || 0,
            content,
            query: q,
            chatName: chat.group_id ? (groupNames.get(chat.group_id) ?? 'Clique') : 'Chat',
          }),
        );
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
          const hubMsgs = await selectInChunks(hubIds, async (chunk) => {
            const { data, error } = await admin
              .from('hub_messages')
              .select('id, hub_id, user_id, body, created_at')
              .in('hub_id', chunk)
              .not('body', 'like', 'e2e:%')
              .not('body', 'like', 'e2e_grp:%')
              .ilike('body', pattern)
              .order('created_at', { ascending: false })
              .limit(MAX_HUB_HITS);
            if (error) {
              console.error('[chat/search] hub_messages:', error.message);
              return [];
            }
            return data ?? [];
          });
          hubMsgs.sort((a, b) => {
            const tb = Date.parse(typeof b.created_at === 'string' ? b.created_at : '') || 0;
            const ta = Date.parse(typeof a.created_at === 'string' ? a.created_at : '') || 0;
            return tb - ta;
          });
          const venues = await selectInChunks(hubIds, async (chunk) => {
            const { data } = await admin.from('hub_venues').select('id, name').in('id', chunk);
            return data ?? [];
          });
          const hubNames = new Map<string, string>();
          for (const v of venues) {
            if (typeof v.id === 'string' && typeof v.name === 'string') {
              hubNames.set(v.id, v.name);
            }
          }
          for (const row of hubMsgs.slice(0, MAX_HUB_HITS)) {
            const hubId = typeof row.hub_id === 'string' ? row.hub_id : '';
            const body = typeof row.body === 'string' ? row.body : '';
            if (!isSearchablePlaintextBody(body)) continue;
            hits.push(
              toHubChatSearchHit({
                messageId: String(row.id),
                hubId,
                senderId: typeof row.user_id === 'string' ? row.user_id : '',
                createdAt: row.created_at,
                body,
                query: q,
                chatName: hubNames.get(hubId) ?? 'Hub',
              }),
            );
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
