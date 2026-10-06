import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseFromRouteRequest } from '@/lib/server/supabaseRouteAuth';
import { createAdminSupabaseClient } from '@/lib/server/admin/supabaseAdmin';
import { loadNudges } from '@/lib/server/nudges';

/**
 * GET /api/me/nudges — undismissed nudges for the current user (every relationship moment kind).
 */
export async function GET(request: NextRequest) {
  try {
    const { user, authError } = await getSupabaseFromRouteRequest(request);
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const nudges = await loadNudges(createAdminSupabaseClient(), user.id);
    return NextResponse.json({ nudges });
  } catch (e) {
    console.error('GET /api/me/nudges:', e);
    return NextResponse.json({ error: 'Failed to load nudges' }, { status: 500 });
  }
}
