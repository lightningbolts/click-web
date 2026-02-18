/**
 * GET /api/chat?connectionId=<uuid>
 * Returns the chat row for a given connection, creating one if it doesn't exist.
 *
 * POST /api/chat
 * Body: { connectionId: string }
 * Explicit create (idempotent – same as GET if already exists)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

async function getAuthUser(req: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
  });

  // Match exact cookie names used by the connections route
  const authCookie =
    req.cookies.get('sb-access-token') ||
    req.cookies.get('sb-lrgcwnmcscimkmslihxp-auth-token');

  // Also support Authorization: Bearer header from the client
  const authHeader = req.headers.get('Authorization');
  const token = authCookie?.value ?? authHeader?.replace('Bearer ', '');

  if (!token) return { user: null, supabase };

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return { user: null, supabase };
  return { user, supabase };
}

async function getOrCreateChat(supabase: SupabaseClient<any>, connectionId: string) {
  // Try to find existing chat
  const { data: existing, error: findErr } = await supabase
    .from('chats')
    .select('*')
    .eq('connection_id', connectionId)
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

  const { user, supabase } = await getAuthUser(req);
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

  const { user, supabase } = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const chat = await getOrCreateChat(supabase, connectionId);
    return NextResponse.json({ chat });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
