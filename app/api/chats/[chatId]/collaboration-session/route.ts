import { NextRequest, NextResponse } from 'next/server';
import { createCollaborationSessionForChat } from '@/lib/collaboration/createCollaborationSession';
import { createAdminClient } from '@/lib/server/connectionWriteAuth';
import { assertChatWritable } from '@/lib/server/chatGatekeeper';
import { getSupabaseFromRouteRequest } from '@/lib/server/supabaseRouteAuth';
import { parseBody } from '@/lib/api/parseBody';
import { collaborationSessionBodySchema } from '@/lib/api/schemas/connections';

type RouteParams = { params: Promise<{ chatId: string }> };

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { chatId: rawId } = await params;
  const chatId = rawId?.trim() ?? '';
  if (!chatId) {
    return NextResponse.json({ error: 'chatId required' }, { status: 400 });
  }

  const { user, authError } = await getSupabaseFromRouteRequest(request);
  if (authError != null || user == null) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let timezoneOffsetMinutes = 0;
  const parsed = await parseBody(request, collaborationSessionBodySchema);
  if (parsed.ok) {
    const raw = parsed.data.timezone_offset_minutes;
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      timezoneOffsetMinutes = Math.trunc(raw);
    } else if (typeof raw === 'string') {
      const n = Number(raw);
      if (Number.isFinite(n)) timezoneOffsetMinutes = Math.trunc(n);
    }
  }
  // Empty / invalid JSON body: keep prior tolerance (default offset 0)

  const admin = createAdminClient();
  const denied = await assertChatWritable(admin, user.id, chatId);
  if (denied) return denied;

  const { data: chat, error: chatErr } = await admin
    .from('chats')
    .select('id, connection_id, group_id')
    .eq('id', chatId)
    .maybeSingle();

  if (chatErr) {
    console.error('[chat-collaboration-session] chat lookup:', chatErr.message);
    return NextResponse.json({ error: 'Failed to resolve chat' }, { status: 500 });
  }
  if (!chat?.id) {
    return NextResponse.json({ error: 'Chat not found' }, { status: 404 });
  }

  let participantUserIds: string[] = [];
  if (chat.group_id) {
    const { data: members, error: membersErr } = await admin
      .from('group_members')
      .select('user_id')
      .eq('group_id', chat.group_id);
    if (membersErr) {
      console.error('[chat-collaboration-session] group_members:', membersErr.message);
      return NextResponse.json({ error: 'Failed to resolve group members' }, { status: 500 });
    }
    participantUserIds = (members ?? [])
      .map((row: { user_id?: unknown }) => (typeof row.user_id === 'string' ? row.user_id : ''))
      .filter(Boolean);
  } else if (chat.connection_id) {
    const { data: connection, error: connErr } = await admin
      .from('connections')
      .select('user_ids')
      .eq('id', chat.connection_id)
      .maybeSingle();
    if (connErr) {
      console.error('[chat-collaboration-session] connection:', connErr.message);
      return NextResponse.json({ error: 'Failed to resolve connection participants' }, { status: 500 });
    }
    participantUserIds = Array.isArray(connection?.user_ids)
      ? connection.user_ids.filter((id): id is string => typeof id === 'string')
      : [];
  }

  const created = await createCollaborationSessionForChat(
    admin,
    chatId,
    participantUserIds,
    timezoneOffsetMinutes,
  );

  if (created == null) {
    return NextResponse.json({ error: 'Failed to open collaboration session' }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    encounter_id: created.encounterId,
    collaboration_ttl: created.collaborationTtl,
  });
}
