import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseFromRouteRequest } from '@/lib/server/supabaseRouteAuth';
import { createAdminSupabaseClient } from '@/lib/server/admin/supabaseAdmin';
import { requireFeature } from '@/lib/server/featureFlags';
import { loadBlockedUserIds } from '@/lib/server/connections/viewerPeers';
import { loadEventsTogether, serializeHistoryEvent } from '@/lib/server/eventHistory';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/users/{id}/events-together — past events the caller and this person both checked in
 * to, most recent first (max 20). Never anyone's full attendance.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ userId: string }> }): Promise<Response> {
  try {
    const { userId: otherId } = await params;
    if (!UUID_RE.test(otherId)) return NextResponse.json({ error: 'Invalid user id' }, { status: 400 });
    const { user, authError } = await getSupabaseFromRouteRequest(request);
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const admin = createAdminSupabaseClient();
    const feature = await requireFeature(admin, 'event_history', user.id);
    if (!feature.ok) return feature.response;
    if (otherId === user.id || (await loadBlockedUserIds(admin, user.id)).has(otherId)) {
      return NextResponse.json({ events: [] });
    }
    const now = Date.now();
    const events = (await loadEventsTogether(admin, user.id, otherId))
      .filter((e) => e.endMs <= now)
      .sort((a, b) => b.endMs - a.endMs)
      .slice(0, 20);
    return NextResponse.json({ events: events.map((e) => serializeHistoryEvent(e, undefined, now, false)) });
  } catch (e) {
    console.error('GET /api/users/[userId]/events-together:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
