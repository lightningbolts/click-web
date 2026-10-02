import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseFromRouteRequest } from '@/lib/server/supabaseRouteAuth';
import { createAdminSupabaseClient } from '@/lib/server/admin/supabaseAdmin';
import { requireFeature } from '@/lib/server/featureFlags';
import { HISTORY_KINDS, loadHistoryPage, type HistoryKind } from '@/lib/server/history';

/**
 * GET /api/me/history?kind=all|events|beacons|hangouts&cursor=<ISO>&limit= — the caller's private
 * history, newest first: `{ items, next_cursor }` (flag `event_history`).
 */
export async function GET(request: NextRequest): Promise<Response> {
  try {
    const { user, authError } = await getSupabaseFromRouteRequest(request);
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const admin = createAdminSupabaseClient();
    const feature = await requireFeature(admin, 'event_history', user.id);
    if (!feature.ok) return feature.response;
    const params = request.nextUrl.searchParams;
    const raw = params.get('kind') ?? 'all';
    const kind: HistoryKind = (HISTORY_KINDS as readonly string[]).includes(raw) ? (raw as HistoryKind) : 'all';
    const cursorMs = Date.parse(params.get('cursor') ?? '');
    const limitRaw = Number(params.get('limit') ?? 30);
    const limit = Number.isFinite(limitRaw) ? Math.min(100, Math.max(1, Math.floor(limitRaw))) : 30;
    const page = await loadHistoryPage(admin, user.id, kind, Number.isFinite(cursorMs) ? cursorMs : null, limit);
    return NextResponse.json({ kind, items: page.items, next_cursor: page.nextCursor }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('GET /api/me/history:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
