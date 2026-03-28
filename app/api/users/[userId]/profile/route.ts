/**
 * GET /api/users/[userId]/profile
 * Returns joined profile for a user (respects RLS — typically connections only).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedSupabase } from '@/lib/server/supabaseAuth';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ userId: string }> },
) {
  const { userId } = await context.params;
  if (!userId?.trim()) {
    return NextResponse.json({ error: 'userId required' }, { status: 400 });
  }

  const { user, supabase } = await getAuthenticatedSupabase(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const [userRes, interestsRes, availRes] = await Promise.all([
      supabase
        .from('users')
        .select('id, first_name, last_name, name, full_name, birthday, image, email')
        .eq('id', userId)
        .maybeSingle(),
      supabase.from('user_interests').select('tags').eq('user_id', userId).maybeSingle(),
      supabase.from('user_availability').select('*').eq('user_id', userId).maybeSingle(),
    ]);

    if (userRes.error) {
      return NextResponse.json({ error: userRes.error.message }, { status: 500 });
    }
    if (!userRes.data) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    let sharedConnection: Record<string, unknown> | null = null;
    if (user.id !== userId) {
      const { data: mutualRows, error: mutualErr } = await supabase
        .from('connections')
        .select(
          'id, created, created_utc, time_of_day_utc, semantic_location, full_location, geo_location, weather_condition, noise_level, exact_noise_level_db, memory_capsule, context_tag_id, last_message_at',
        )
        .contains('user_ids', [user.id, userId]);
      if (mutualErr) {
        console.warn('profile mutual connection:', mutualErr.message);
      } else if (mutualRows && mutualRows.length > 0) {
        type ConnRow = { created?: number; last_message_at?: number | null };
        const best = (mutualRows as ConnRow[]).reduce((a, b) => {
          const ta = Math.max(a.last_message_at ?? 0, a.created ?? 0);
          const tb = Math.max(b.last_message_at ?? 0, b.created ?? 0);
          return tb >= ta ? b : a;
        });
        sharedConnection = best as Record<string, unknown>;
      }
    }

    return NextResponse.json({
      user: userRes.data,
      tags: (interestsRes.data as { tags?: string[] } | null)?.tags ?? [],
      availability: availRes.data ?? null,
      sharedConnection,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to load profile';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
