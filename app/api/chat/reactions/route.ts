/**
 * POST /api/chat/reactions
 * Body: { messageId: string; reactionType: string }
 * Toggle a reaction – adds if absent, removes if present.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedSupabase } from '@/lib/server/supabaseAuth';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { messageId, reactionType } = body;

  if (!messageId || !reactionType) {
    return NextResponse.json({ error: 'messageId and reactionType are required' }, { status: 400 });
  }

  const { user, supabase } = await getAuthenticatedSupabase(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Check if reactions already exist for this user/message/emoji
  const { data: existing, error: existingError } = await supabase
    .from('message_reactions')
    .select('id')
    .eq('message_id', messageId)
    .eq('user_id', user.id)
    .eq('reaction_type', reactionType)
    .limit(50);

  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 500 });
  }

  if ((existing ?? []).length > 0) {
    // Toggle off – delete
    const { error } = await supabase
      .from('message_reactions')
      .delete()
      .in('id', (existing ?? []).map((row: { id: string }) => row.id));

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
