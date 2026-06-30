import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/server/connectionWriteAuth';
import { assertChatWritable } from '@/lib/server/chatGatekeeper';
import { getSupabaseFromRouteRequest } from '@/lib/server/supabaseRouteAuth';

type TargetType = 'user' | 'chat';

type TimelineEntryRow = {
  id: string;
  target_type: TargetType;
  target_id: string;
  author_user_id: string;
  body: string;
  visibility: 'private' | 'shared' | 'everyone';
  created_at: string;
};

function normalizeTargetType(raw: unknown): TargetType | null {
  const value = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  return value === 'user' || value === 'chat' ? value : null;
}

function normalizeTimelineVisibility(raw: unknown): 'private' | 'shared' | null {
  const value = typeof raw === 'string' ? raw.trim().toLowerCase() : 'private';
  if (value === 'private') return 'private';
  if (value === 'shared' || value === 'everyone') return 'shared';
  return null;
}

function displayName(row: Record<string, unknown> | null | undefined): string | null {
  if (!row) return null;
  const direct = typeof row.name === 'string' ? row.name.trim() : '';
  if (direct) return direct;
  const first = typeof row.first_name === 'string' ? row.first_name.trim() : '';
  const last = typeof row.last_name === 'string' ? row.last_name.trim() : '';
  const combined = [first, last].filter(Boolean).join(' ').trim();
  if (combined) return combined;
  const email = typeof row.email === 'string' ? row.email.trim() : '';
  return email || null;
}

async function loadUserNameMap(admin: SupabaseClient, userIds: string[]): Promise<Map<string, string>> {
  const ids = [...new Set(userIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) return new Map();
  const { data } = await admin
    .from('users')
    .select('id, name, first_name, last_name, email')
    .in('id', ids);
  return new Map(
    (data ?? []).map((row: Record<string, unknown>) => [
      String(row.id),
      displayName(row) ?? 'Member',
    ]),
  );
}

async function authorizeTarget(
  admin: SupabaseClient,
  userId: string,
  targetType: TargetType,
  targetId: string,
): Promise<{ ok: true; participantIds: string[]; targetId: string; targetIds: string[] } | { ok: false; response: NextResponse }> {
  if (targetType === 'chat') {
    const { data: chat, error: chatErr } = await admin
      .from('chats')
      .select('id, connection_id, group_id')
      .or(`id.eq.${targetId},connection_id.eq.${targetId},group_id.eq.${targetId}`)
      .maybeSingle();
    if (chatErr) return { ok: false, response: NextResponse.json({ error: chatErr.message }, { status: 400 }) };
    if (!chat) return { ok: false, response: NextResponse.json({ error: 'Chat not found' }, { status: 404 }) };

    const chatId = typeof chat.id === 'string' ? chat.id : '';
    if (!chatId) return { ok: false, response: NextResponse.json({ error: 'Invalid chat configuration' }, { status: 400 }) };
    const targetIds = [
      chatId,
      typeof chat.connection_id === 'string' ? chat.connection_id : '',
      typeof chat.group_id === 'string' ? chat.group_id : '',
      targetId,
    ].filter((id, index, arr) => id.length > 0 && arr.indexOf(id) === index);

    const denied = await assertChatWritable(admin, userId, chatId);
    if (denied) return { ok: false, response: denied };

    if (chat.group_id) {
      const { data: members, error } = await admin
        .from('group_members')
        .select('user_id')
        .eq('group_id', chat.group_id);
      if (error) return { ok: false, response: NextResponse.json({ error: error.message }, { status: 400 }) };
      return {
        ok: true,
        targetId: chatId,
        targetIds,
        participantIds: (members ?? [])
          .map((row: { user_id?: unknown }) => (typeof row.user_id === 'string' ? row.user_id : ''))
          .filter(Boolean),
      };
    }

    if (chat.connection_id) {
      const { data: conn, error } = await admin
        .from('connections')
        .select('user_ids')
        .eq('id', chat.connection_id)
        .maybeSingle();
      if (error) return { ok: false, response: NextResponse.json({ error: error.message }, { status: 400 }) };
      return {
        ok: true,
        targetId: chatId,
        targetIds,
        participantIds: Array.isArray(conn?.user_ids)
          ? conn.user_ids.filter((id): id is string => typeof id === 'string')
          : [],
      };
    }

    return { ok: false, response: NextResponse.json({ error: 'Invalid chat configuration' }, { status: 400 }) };
  }

  if (targetId === userId) return { ok: true, targetId, targetIds: [targetId], participantIds: [userId] };

  const { data: connection, error } = await admin
    .from('connections')
    .select('user_ids')
    .contains('user_ids', [userId, targetId])
    .limit(1)
    .maybeSingle();
  if (error) return { ok: false, response: NextResponse.json({ error: error.message }, { status: 400 }) };
  if (!connection) return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  return { ok: true, targetId, targetIds: [targetId, userId], participantIds: [userId, targetId] };
}

async function loadSharedInterests(admin: SupabaseClient, participantIds: string[]) {
  const ids = [...new Set(participantIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length < 2) return [];

  const [interestsRes, names] = await Promise.all([
    admin.from('user_interests').select('user_id, tags').in('user_id', ids),
    loadUserNameMap(admin, ids),
  ]);
  if (interestsRes.error) throw new Error(interestsRes.error.message);

  const byKey = new Map<string, { tag: string; userIds: Set<string> }>();
  for (const row of interestsRes.data ?? []) {
    const userId = typeof row.user_id === 'string' ? row.user_id : '';
    const tags = Array.isArray(row.tags) ? row.tags : [];
    for (const rawTag of tags) {
      if (typeof rawTag !== 'string') continue;
      const tag = rawTag.trim();
      if (!tag) continue;
      const key = tag.toLowerCase();
      const existing = byKey.get(key) ?? { tag, userIds: new Set<string>() };
      existing.userIds.add(userId);
      byKey.set(key, existing);
    }
  }

  return [...byKey.values()]
    .map((item) => {
      const userIds = [...item.userIds].sort();
      return {
        tag: item.tag,
        count: userIds.length,
        user_ids: userIds,
        member_names: userIds.map((id) => names.get(id) ?? 'Member'),
      };
    })
    .filter((item) => item.count >= 2)
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

async function buildPayload(
  admin: SupabaseClient,
  viewerUserId: string,
  targetType: TargetType,
  targetId: string,
  participantIds: string[],
  targetIds: string[] = [targetId],
) {
  const ids = [...new Set(targetIds.map((id) => id.trim()).filter(Boolean))];
  let entriesQuery = admin
    .from('profile_timeline_entries')
    .select('id, target_type, target_id, author_user_id, body, visibility, created_at')
    .eq('target_type', targetType);
  entriesQuery = ids.length > 1 ? entriesQuery.in('target_id', ids) : entriesQuery.eq('target_id', targetId);
  const [entriesRes, sharedInterests] = await Promise.all([
    entriesQuery
      .or(`visibility.in.(shared,everyone),author_user_id.eq.${viewerUserId}`)
      .order('created_at', { ascending: false })
      .limit(100),
    targetType === 'chat' ? loadSharedInterests(admin, participantIds) : Promise.resolve([]),
  ]);
  if (entriesRes.error) throw new Error(entriesRes.error.message);

  const participantSet = new Set(participantIds.map((id) => id.trim()).filter(Boolean));
  const rows = ((entriesRes.data ?? []) as TimelineEntryRow[]).filter((row) => {
    if (row.author_user_id === viewerUserId) return true;
    if (row.visibility !== 'shared' && row.visibility !== 'everyone') return false;
    return participantSet.has(row.author_user_id);
  });
  const names = await loadUserNameMap(admin, rows.map((row) => row.author_user_id));
  return {
    target_type: targetType,
    target_id: targetId,
    shared_interests: sharedInterests,
    journal_entries: rows.map((row) => ({
      ...row,
      author_name: names.get(row.author_user_id) ?? null,
    })),
  };
}

export async function GET(request: NextRequest) {
  const targetType = normalizeTargetType(request.nextUrl.searchParams.get('target_type'));
  const targetId = request.nextUrl.searchParams.get('target_id')?.trim() ?? '';
  if (!targetType || !targetId) {
    return NextResponse.json({ error: 'target_type and target_id are required' }, { status: 400 });
  }

  const { user, authError } = await getSupabaseFromRouteRequest(request);
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const auth = await authorizeTarget(admin, user.id, targetType, targetId);
  if (!auth.ok) return auth.response;

  try {
    return NextResponse.json(await buildPayload(admin, user.id, targetType, auth.targetId, auth.participantIds, auth.targetIds));
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to load timeline';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const { user, authError } = await getSupabaseFromRouteRequest(request);
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { target_type?: unknown; target_id?: unknown; body?: unknown; visibility?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const targetType = normalizeTargetType(body.target_type);
  const targetId = typeof body.target_id === 'string' ? body.target_id.trim() : '';
  const text = typeof body.body === 'string' ? body.body.trim() : '';
  const visibility = normalizeTimelineVisibility(body.visibility);

  if (!targetType || !targetId) {
    return NextResponse.json({ error: 'target_type and target_id are required' }, { status: 400 });
  }
  if (!text) return NextResponse.json({ error: 'Journal entry is required' }, { status: 400 });
  if (text.length > 1200) return NextResponse.json({ error: 'Journal entry is too long' }, { status: 400 });
  if (visibility == null) {
    return NextResponse.json({ error: 'visibility must be private, shared, or everyone' }, { status: 400 });
  }

  const admin = createAdminClient();
  const auth = await authorizeTarget(admin, user.id, targetType, targetId);
  if (!auth.ok) return auth.response;

  const { error } = await admin.from('profile_timeline_entries').insert({
    target_type: targetType,
    target_id: auth.targetId,
    author_user_id: user.id,
    body: text,
    visibility,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  try {
    return NextResponse.json(await buildPayload(admin, user.id, targetType, auth.targetId, auth.participantIds, auth.targetIds));
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to load timeline';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function loadAuthorEntry(
  admin: SupabaseClient,
  entryId: string,
  userId: string,
): Promise<{ ok: true; row: TimelineEntryRow } | { ok: false; response: NextResponse }> {
  const { data: row, error } = await admin
    .from('profile_timeline_entries')
    .select('id, target_type, target_id, author_user_id, body, visibility, created_at')
    .eq('id', entryId)
    .maybeSingle();
  if (error) return { ok: false, response: NextResponse.json({ error: error.message }, { status: 500 }) };
  if (!row) return { ok: false, response: NextResponse.json({ error: 'Journal entry not found' }, { status: 404 }) };
  const entry = row as TimelineEntryRow;
  if (entry.author_user_id !== userId) {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { ok: true, row: entry };
}

export async function PUT(request: NextRequest) {
  const { user, authError } = await getSupabaseFromRouteRequest(request);
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { id?: unknown; body?: unknown; visibility?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const entryId = typeof body.id === 'string' ? body.id.trim() : '';
  const text = typeof body.body === 'string' ? body.body.trim() : '';
  const visibility = normalizeTimelineVisibility(body.visibility);
  if (!entryId) return NextResponse.json({ error: 'id is required' }, { status: 400 });
  if (!text) return NextResponse.json({ error: 'Journal entry is required' }, { status: 400 });
  if (text.length > 1200) return NextResponse.json({ error: 'Journal entry is too long' }, { status: 400 });
  if (visibility == null) {
    return NextResponse.json({ error: 'visibility must be private, shared, or everyone' }, { status: 400 });
  }

  const admin = createAdminClient();
  const loaded = await loadAuthorEntry(admin, entryId, user.id);
  if (!loaded.ok) return loaded.response;
  const auth = await authorizeTarget(admin, user.id, loaded.row.target_type, loaded.row.target_id);
  if (!auth.ok) return auth.response;

  const { error } = await admin
    .from('profile_timeline_entries')
    .update({ body: text, visibility, updated_at: new Date().toISOString() })
    .eq('id', entryId)
    .eq('author_user_id', user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  try {
    return NextResponse.json(
      await buildPayload(admin, user.id, loaded.row.target_type, auth.targetId, auth.participantIds, auth.targetIds),
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to load timeline';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const { user, authError } = await getSupabaseFromRouteRequest(request);
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { id?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const entryId = typeof body.id === 'string' ? body.id.trim() : '';
  if (!entryId) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const admin = createAdminClient();
  const loaded = await loadAuthorEntry(admin, entryId, user.id);
  if (!loaded.ok) return loaded.response;
  const auth = await authorizeTarget(admin, user.id, loaded.row.target_type, loaded.row.target_id);
  if (!auth.ok) return auth.response;

  const { error } = await admin
    .from('profile_timeline_entries')
    .delete()
    .eq('id', entryId)
    .eq('author_user_id', user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  try {
    return NextResponse.json(
      await buildPayload(admin, user.id, loaded.row.target_type, auth.targetId, auth.participantIds, auth.targetIds),
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to load timeline';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
