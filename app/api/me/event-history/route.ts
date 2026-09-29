import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseFromRouteRequest } from '@/lib/server/supabaseRouteAuth';
import { createAdminSupabaseClient } from '@/lib/server/admin/supabaseAdmin';
import { requireFeature } from '@/lib/server/featureFlags';
import { parseEventHistoryFilter, pastEventsPage } from '@/lib/events/eventHistory';
import { loadRecapStates, loadUserEvents, serializeHistoryEvent } from '@/lib/server/eventHistory';

/**
 * GET /api/me/event-history?filter=all|went|rsvpd|saved|hosted&cursor=<ends_at ISO>&limit=
 * The caller's past events (private to them), most recent first:
 * `{ events: [{ beacon_id, title, starts_at, ends_at, location_name, image_url, relation, recap }], next_cursor }`.
 */
export async function GET(request: NextRequest): Promise<Response> {
  try {
    const { user, authError } = await getSupabaseFromRouteRequest(request);
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const admin = createAdminSupabaseClient();
    const feature = await requireFeature(admin, 'event_history', user.id);
    if (!feature.ok) return feature.response;

    const params = request.nextUrl.searchParams;
    const filter = parseEventHistoryFilter(params.get('filter'));
    const cursorMs = Date.parse(params.get('cursor') ?? '');
    const limitRaw = Number(params.get('limit') ?? 30);
    const limit = Number.isFinite(limitRaw) ? Math.min(100, Math.max(1, Math.floor(limitRaw))) : 30;
    const now = Date.now();

    const { page, nextCursorEndMs } = pastEventsPage(
      await loadUserEvents(admin, user.id),
      filter,
      now,
      Number.isFinite(cursorMs) ? cursorMs : null,
      limit,
    );
    const recaps = await loadRecapStates(admin, page.map((e) => e.beaconId));
    return NextResponse.json(
      {
        filter,
        events: page.map((e) => serializeHistoryEvent(e, recaps.get(e.beaconId), now)),
        next_cursor: nextCursorEndMs != null ? new Date(nextCursorEndMs).toISOString() : null,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    console.error('GET /api/me/event-history:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
