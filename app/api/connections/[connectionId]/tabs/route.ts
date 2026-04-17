/**
 * GET /api/connections/[connectionId]/tabs
 *
 * Returns profile-sheet tab payloads for a conversation, backed by the
 * `public.messages` table for the chat associated with [connectionId].
 *
 *   - `media`  → rows where `message_type IN ('image','audio')`
 *   - `files`  → rows where `message_type = 'file'`
 *   - `links`  → intentionally omitted server-side; [content] is E2EE,
 *                so clients filter their locally-decrypted message state for
 *                `http://` / `https://` substrings.
 *
 * Auth: standard Supabase bearer JWT (via [getAuthenticatedSupabase]). Must be
 * a participant on the connection (enforced by [assertChatWritable]).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedSupabase } from '@/lib/server/supabaseAuth';
import { assertChatWritable, createChatGatekeeperAdmin } from '@/lib/server/chatGatekeeper';
import { normalizeDbMessage } from '@/lib/chat/messages';

type TabMessage = ReturnType<typeof normalizeDbMessage>;

function chatIdFromQueryOrParam(req: NextRequest, param: string): string {
  const fromQuery = req.nextUrl.searchParams.get('chatId')?.trim();
  if (fromQuery) return fromQuery;
  return param.trim();
}

async function resolveChatIdForParam(
  supabase: Awaited<ReturnType<typeof getAuthenticatedSupabase>>['supabase'],
  paramId: string,
): Promise<string | null> {
  // The dynamic segment is named `connectionId` by filesystem convention
  // (see `app/api/connections/[connectionId]/...`), but the directive frames
  // it as `chatId`. Accept either by trying a direct chat lookup first and
  // falling back to a connection → chat resolution.
  const { data: chatRow } = await supabase
    .from('chats')
    .select('id')
    .eq('id', paramId)
    .maybeSingle();
  if ((chatRow as { id?: string } | null)?.id) {
    return (chatRow as { id: string }).id;
  }

  const { data: byConn } = await supabase
    .from('chats')
    .select('id')
    .eq('connection_id', paramId)
    .maybeSingle();
  return (byConn as { id?: string } | null)?.id ?? null;
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ connectionId: string }> },
) {
  const { connectionId } = await context.params;
  const rawId = chatIdFromQueryOrParam(req, connectionId);
  if (!rawId) {
    return NextResponse.json({ error: 'chatId required' }, { status: 400 });
  }

  const { user, supabase } = await getAuthenticatedSupabase(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const chatId = await resolveChatIdForParam(supabase, rawId);
  if (!chatId) {
    return NextResponse.json({ error: 'Chat not found' }, { status: 404 });
  }

  // Enforce participant-only access using the same gatekeeper as
  // `/api/chat/messages` so media/file listings never leak outside the chat.
  const admin = createChatGatekeeperAdmin();
  const denied = await assertChatWritable(admin, user.id, chatId);
  if (denied) return denied;

  const limit = (() => {
    const raw = parseInt(req.nextUrl.searchParams.get('limit') ?? '200', 10);
    if (!Number.isFinite(raw)) return 200;
    return Math.min(Math.max(raw, 1), 500);
  })();

  const [mediaRes, filesRes] = await Promise.all([
    supabase
      .from('messages')
      .select('*')
      .eq('chat_id', chatId)
      .in('message_type', ['image', 'audio'])
      .order('time_created', { ascending: false })
      .limit(limit),
    supabase
      .from('messages')
      .select('*')
      .eq('chat_id', chatId)
      .eq('message_type', 'file')
      .order('time_created', { ascending: false })
      .limit(limit),
  ]);

  if (mediaRes.error) {
    return NextResponse.json({ error: mediaRes.error.message }, { status: 500 });
  }
  if (filesRes.error) {
    return NextResponse.json({ error: filesRes.error.message }, { status: 500 });
  }

  const media: TabMessage[] = (mediaRes.data ?? []).map((row: Record<string, unknown>) =>
    normalizeDbMessage(row),
  );
  const files: TabMessage[] = (filesRes.data ?? []).map((row: Record<string, unknown>) =>
    normalizeDbMessage(row),
  );

  return NextResponse.json({
    chatId,
    // NB: `links` is intentionally omitted — see the route-level doc comment.
    media,
    files,
  });
}
