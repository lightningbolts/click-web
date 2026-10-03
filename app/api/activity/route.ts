import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseFromRouteRequest } from '@/lib/server/supabaseRouteAuth';
import { createAdminSupabaseClient } from '@/lib/server/admin/supabaseAdmin';
import { loadActivity } from '@/lib/server/activity';

/**
 * GET /api/activity?before=<iso> — the viewer's activity inbox, newest first:
 * `{ items, seen_at, next_before }`. Items newer than `seen_at` are new (the Home badge);
 * pass `next_before` back as `before` for the next page (null on the last one).
 */
export async function GET(request: NextRequest): Promise<Response> {
  try {
    const { user, authError } = await getSupabaseFromRouteRequest(request);
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const before = request.nextUrl.searchParams.get('before');
    if (before && Number.isNaN(Date.parse(before))) {
      return NextResponse.json({ error: 'before must be an ISO date' }, { status: 400 });
    }
    const page = await loadActivity(createAdminSupabaseClient(), user.id, { before });
    return NextResponse.json(page, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('GET /api/activity:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
