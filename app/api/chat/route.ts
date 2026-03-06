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
