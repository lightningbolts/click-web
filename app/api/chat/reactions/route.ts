/**
 * POST /api/chat/reactions
 * Body: { messageId: string; reactionType: string }
 * Toggle a reaction – adds if absent, removes if present.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

async function getAuthUser(req: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
  });

  const authCookie =
    req.cookies.get('sb-access-token') ||
    req.cookies.get('sb-lrgcwnmcscimkmslihxp-auth-token');

  const authHeader = req.headers.get('Authorization');
  const token = authCookie?.value ?? authHeader?.replace('Bearer ', '');

  if (!token) return { user: null, supabase };

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return { user: null, supabase };
  return { user, supabase };
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { messageId, reactionType } = body;

  if (!messageId || !reactionType) {
    return NextResponse.json({ error: 'messageId and reactionType are required' }, { status: 400 });
  }

  const { user, supabase } = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Check if the reaction already exists
  const { data: existing } = await supabase
    .from('message_reactions')
    .select('id')
    .eq('message_id', messageId)
    .eq('user_id', user.id)
    .eq('reaction_type', reactionType)
    .maybeSingle();

  if (existing) {
    // Toggle off – delete
    const { error } = await supabase
      .from('message_reactions')
      .delete()
      .eq('id', existing.id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ action: 'removed' });
  }

  // Toggle on – insert
  const { data: reaction, error: insertErr } = await supabase
    .from('message_reactions')
    .insert({
      message_id: messageId,
      user_id: user.id,
      reaction_type: reactionType,
      created_at: Date.now(),
    })
    .select()
    .single();

  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });
  return NextResponse.json({ action: 'added', reaction }, { status: 201 });
}
