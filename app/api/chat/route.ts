/**
 * GET /api/chat?connectionId=<uuid>
 * Returns the chat row for a given connection, creating one if it doesn't exist.
 *
 * POST /api/chat
 * Body: { connectionId: string }
 * Explicit create (idempotent – same as GET if already exists)
 */

import { NextRequest, NextResponse } from 'next/server';
import { type SupabaseClient } from '@supabase/supabase-js';
import { getAuthenticatedSupabase } from '@/lib/server/supabaseAuth';

async function getOrCreateChat(supabase: SupabaseClient<any>, connectionId: string) {
  // Try to find existing chat
  const { data: existing, error: findErr } = await supabase
    .from('chats')
    .select('*')
    .eq('connection_id', connectionId)
    .limit(1)
    .maybeSingle();

  if (findErr) throw findErr;
  if (existing) return existing;

  // Create new chat
  const now = Date.now();
  const { data: created, error: createErr } = await supabase
    .from('chats')
    .insert({ connection_id: connectionId, created_at: now, updated_at: now })
    .select()
    .single();

  if (createErr) throw createErr;
  return created;
}

export async function GET(req: NextRequest) {
  const connectionId = req.nextUrl.searchParams.get('connectionId');
  const groupId = req.nextUrl.searchParams.get('groupId');

  if (!connectionId && !groupId) {
    return NextResponse.json(
      { error: 'connectionId or groupId is required' },
      { status: 400 },
    );
  }

  const { user, supabase } = await getAuthenticatedSupabase(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    if (groupId) {
      const { data: member, error: memErr } = await supabase
        .from('group_members')
        .select('group_id')
        .eq('group_id', groupId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (memErr || !member) {
        return NextResponse.json({ error: 'Group not found or access denied' }, { status: 404 });
      }

      const { data: chat, error: chatErr } = await supabase
        .from('chats')
        .select('*')
        .eq('group_id', groupId)
        .maybeSingle();

      if (chatErr || !chat) {
        return NextResponse.json({ error: 'Chat not found for this group' }, { status: 404 });
      }

      return NextResponse.json({ chat });
    }

    const chat = await getOrCreateChat(supabase, connectionId!);
    return NextResponse.json({ chat });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { connectionId } = body;
  if (!connectionId) {
    return NextResponse.json({ error: 'connectionId is required' }, { status: 400 });
  }

  const { user, supabase } = await getAuthenticatedSupabase(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const chat = await getOrCreateChat(supabase, connectionId);
    return NextResponse.json({ chat });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
