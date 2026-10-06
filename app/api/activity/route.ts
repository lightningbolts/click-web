import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseFromRouteRequest } from '@/lib/server/supabaseRouteAuth';
import { createAdminSupabaseClient } from '@/lib/server/admin/supabaseAdmin';
import { loadActivity, pendingPriorRequests } from '@/lib/server/activity';
import { requestConnectionId } from '@/lib/activity/activityView';

/**
 * GET /api/activity?before=<iso> — the viewer's activity inbox, newest first:
 * `{ items, seen_at, next_before, pending_requests }` (`pending_requests`: connection ids of prior
 * requests in this page still waiting on the viewer, for inline Accept). Items newer than `seen_at` are new (the Home badge);
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
    const admin = createAdminSupabaseClient();
    const page = await loadActivity(admin, user.id, { before });
    const requestIds = page.items.flatMap((i) => requestConnectionId(i) ?? []);
    const pending = await pendingPriorRequests(admin, user.id, requestIds);
    return NextResponse.json({ ...page, pending_requests: [...pending] }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('GET /api/activity:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
