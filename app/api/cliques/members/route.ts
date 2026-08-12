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
import { parseBody } from '@/lib/api/parseBody';
import { cliquesMembersBodySchema } from '@/lib/api/schemas/connections';

export async function POST(request: NextRequest) {
  const { user, supabase, authError } = await getSupabaseFromRouteRequest(request);
  if (authError || !user || !supabase) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const parsed = await parseBody(request, cliquesMembersBodySchema);
  if (!parsed.ok) return parsed.response;

  const groupId = parsed.data.group_id.trim();
  const newMemberUserId = (parsed.data.new_member_user_id ?? '').trim();

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

  const parsed = await parseBody(request, cliquesMembersBodySchema);
  if (!parsed.ok) return parsed.response;

  const groupId = parsed.data.group_id.trim();
  const memberUserId = (parsed.data.member_user_id ?? '').trim();

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
