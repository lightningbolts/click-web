/**
 * POST /api/cliques/members — add a member to a verified clique (creator only).
 * DELETE /api/cliques/members — remove a member (creator only).
 *
 * Thin client: mobile sends group + user ids; server wraps E2EE group keys.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseFromRouteRequest } from '@/lib/server/supabaseRouteAuth';
import {
  addCliqueMemberFromConnections,
  removeCliqueMemberRpc,
} from '@/lib/chat/createVerifiedClick';

export async function POST(request: NextRequest) {
  const { user, supabase, authError } = await getSupabaseFromRouteRequest(request);
  if (authError || !user || !supabase) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { group_id?: unknown; groupId?: unknown; new_member_user_id?: unknown; newMemberUserId?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const groupId =
    (typeof body.group_id === 'string' ? body.group_id : typeof body.groupId === 'string' ? body.groupId : '')
      .trim();
  const newMemberUserId =
    (
      typeof body.new_member_user_id === 'string'
        ? body.new_member_user_id
        : typeof body.newMemberUserId === 'string'
          ? body.newMemberUserId
          : ''
    ).trim();

  if (!groupId || !newMemberUserId) {
    return NextResponse.json({ error: 'group_id and new_member_user_id are required' }, { status: 400 });
  }

  try {
    await addCliqueMemberFromConnections(supabase, user.id, groupId, newMemberUserId);
    return NextResponse.json({ added: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to add member';
    console.error('[cliques/members POST]', message);
    const status = message.toLowerCase().includes('creator') || message.toLowerCase().includes('forbidden')
      ? 403
      : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(request: NextRequest) {
  const { user, supabase, authError } = await getSupabaseFromRouteRequest(request);
  if (authError || !user || !supabase) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { group_id?: unknown; groupId?: unknown; member_user_id?: unknown; memberUserId?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const groupId =
    (typeof body.group_id === 'string' ? body.group_id : typeof body.groupId === 'string' ? body.groupId : '')
      .trim();
  const memberUserId =
    (
      typeof body.member_user_id === 'string'
        ? body.member_user_id
        : typeof body.memberUserId === 'string'
          ? body.memberUserId
          : ''
    ).trim();

  if (!groupId || !memberUserId) {
    return NextResponse.json({ error: 'group_id and member_user_id are required' }, { status: 400 });
  }

  try {
    await removeCliqueMemberRpc(supabase, groupId, memberUserId);
    return NextResponse.json({ removed: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to remove member';
    console.error('[cliques/members DELETE]', message);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
