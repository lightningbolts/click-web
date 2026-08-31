/**
 * GET /api/insights/widget-vibe
 * Home-screen widget payload (pre-formatted strings + counts). Cached at the edge for five minutes.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseFromRouteRequest } from '@/lib/server/supabaseRouteAuth';
import { buildWidgetVibePayload } from '@/lib/insights/widgetVibePayload';

export const revalidate = 300;

const CACHE_HEADER = 'public, s-maxage=300, stale-while-revalidate=300';

export async function GET(request: NextRequest) {
  const { supabase, user, authError } = await getSupabaseFromRouteRequest(request);
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('connections')
    .select('id, status, expiry_state, has_begun, user_ids, source')
    .contains('user_ids', [user.id])
    .eq('source', 'handshake');

  if (error) {
    console.error('widget-vibe connections:', error.message);
    return NextResponse.json({ error: 'Failed to load connections' }, { status: 500 });
  }

  const payload = buildWidgetVibePayload((data ?? []) as Record<string, unknown>[]);
  return NextResponse.json(payload, {
    headers: {
      'Cache-Control': CACHE_HEADER,
      Vary: 'Authorization',
    },
  });
}
