/**
 * GET /api/users/[userId]/profile
 * Returns joined profile for a user (respects RLS — typically connections only).
 */

import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedSupabase } from '@/lib/server/supabaseAuth';
import {
  normalizeAvailabilityIntentRows,
  normalizeLegacyAvailabilityRecord,
  type AvailabilityIntentRow,
} from '@/lib/userProfile/availability';
import { getSharedInterestTags } from '@/lib/userProfile/sharedInterests';

function createAdminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  );
}

export type AvailabilityIntentPayload = AvailabilityIntentRow;

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

    const profileTags = (interestsRes.data as { tags?: string[] } | null)?.tags ?? [];

    let availabilityIntents: AvailabilityIntentRow[] = [];
    try {
      const admin = createAdminClient();
      const { data: intentRows, error: intentErr } = await admin
        .from('availability_intents')
        .select('id, timeframe, intent_tag, expires_at')
        .eq('user_id', userId)
        .gt('expires_at', new Date().toISOString())
        .order('expires_at', { ascending: true });

      if (!intentErr && intentRows) {
        availabilityIntents = normalizeAvailabilityIntentRows(intentRows);
      } else if (intentErr) {
        console.warn('profile availability_intents:', intentErr.message);
      }
    } catch (e) {
      console.warn('profile availability_intents fetch failed:', e);
    }

    let viewerInterestTags: string[] = [];
    let sharedInterestTags: string[] = [];
    if (user.id !== userId) {
      const { data: myRow } = await supabase
        .from('user_interests')
        .select('tags')
        .eq('user_id', user.id)
        .maybeSingle();
      viewerInterestTags = (myRow as { tags?: string[] } | null)?.tags ?? [];
      sharedInterestTags = getSharedInterestTags(viewerInterestTags, profileTags);
    }

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
        .select('id, created, created_utc, time_of_day_utc, last_message_at, connection_encounters(*)')
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
      tags: profileTags,
      availability: normalizeLegacyAvailabilityRecord(availRes.data ?? null),
      availabilityIntents,
      viewerInterestTags,
      sharedInterestTags,
      sharedConnection,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to load profile';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
