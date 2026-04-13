import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import type { User } from '@supabase/supabase-js';
import { getSupabaseFromRouteRequest } from '@/lib/server/supabaseRouteAuth';
import { isActiveChatListStatus, normalizeConnectionStatus } from '@/lib/dashboard/connectionStatus';

export function createChatGatekeeperAdmin(): SupabaseClient {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  );
}

type JwtOk = { ok: true; user: User; bearer: string };
type JwtFail = { ok: false; response: NextResponse };

export async function requireBearerUser(request: NextRequest): Promise<JwtOk | JwtFail> {
  const { user, authError } = await getSupabaseFromRouteRequest(request);
  if (authError || !user) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  const bearer =
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim() || '';
  if (!bearer) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  return { ok: true, user, bearer };
}

/**
 * Ensures [userId] may write to [chatId]: group membership, or 1:1 connection participant with
 * an active / pending / kept lifecycle (matches mobile active list semantics).
 */
export async function assertChatWritable(
  admin: SupabaseClient,
  userId: string,
  chatId: string,
): Promise<NextResponse | null> {
  const trimmed = chatId.trim();
  if (!trimmed) {
    return NextResponse.json({ error: 'chat_id is required' }, { status: 400 });
  }

  const { data: chat, error: chatErr } = await admin
    .from('chats')
    .select('id, connection_id, group_id')
    .eq('id', trimmed)
    .maybeSingle();

  if (chatErr) {
    console.error('[chatGatekeeper] chat lookup:', chatErr.message);
    return NextResponse.json({ error: chatErr.message }, { status: 400 });
  }
  if (!chat) {
    return NextResponse.json({ error: 'Chat not found' }, { status: 404 });
  }

  if (chat.group_id) {
    const { data: member, error: memErr } = await admin
      .from('group_members')
      .select('user_id')
      .eq('group_id', chat.group_id)
      .eq('user_id', userId)
      .maybeSingle();

    if (memErr) {
      console.error('[chatGatekeeper] group_members:', memErr.message);
      return NextResponse.json({ error: memErr.message }, { status: 400 });
    }
    if (!member) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    return null;
  }

  const connectionId = chat.connection_id as string | null | undefined;
  if (!connectionId) {
    return NextResponse.json({ error: 'Invalid chat configuration' }, { status: 400 });
  }

  const { data: conn, error: connErr } = await admin
    .from('connections')
    .select('id, user_ids, status, expiry_state')
    .eq('id', connectionId)
    .maybeSingle();

  if (connErr) {
    console.error('[chatGatekeeper] connection lookup:', connErr.message);
    return NextResponse.json({ error: connErr.message }, { status: 400 });
  }

  const ids = (conn?.user_ids as string[] | null)?.map((id) => id.trim()).filter((id) => id.length > 0) ?? [];
  if (!conn || ids.length === 0 || !ids.includes(userId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const st = normalizeConnectionStatus(conn as Record<string, unknown>);
  if (!isActiveChatListStatus(st)) {
    return NextResponse.json({ error: 'Connection not active for chat' }, { status: 403 });
  }

  return null;
}

export async function assertMessageInWritableChat(
  admin: SupabaseClient,
  userId: string,
  messageId: string,
): Promise<{ ok: true; chatId: string } | { ok: false; response: NextResponse }> {
  const { data: row, error } = await admin
    .from('messages')
    .select('id, chat_id')
    .eq('id', messageId.trim())
    .maybeSingle();

  if (error) {
    console.error('[chatGatekeeper] message lookup:', error.message);
    return { ok: false, response: NextResponse.json({ error: error.message }, { status: 400 }) };
  }
  if (!row?.chat_id) {
    return { ok: false, response: NextResponse.json({ error: 'Message not found' }, { status: 404 }) };
  }

  const denied = await assertChatWritable(admin, userId, String(row.chat_id));
  if (denied) return { ok: false, response: denied };

  return { ok: true, chatId: String(row.chat_id) };
}
