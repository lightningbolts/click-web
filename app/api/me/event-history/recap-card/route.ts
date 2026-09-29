import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseFromRouteRequest } from '@/lib/server/supabaseRouteAuth';
import { createAdminSupabaseClient } from '@/lib/server/admin/supabaseAdmin';
import { configNumber, requireFeature } from '@/lib/server/featureFlags';
import { recapCardEvent } from '@/lib/events/eventHistory';
import { loadRecapStates, loadUserEvents, serializeHistoryEvent } from '@/lib/server/eventHistory';

/**
 * GET /api/me/event-history/recap-card — the single Home card: `{ card }` for the most recent event
 * the caller was at (or hosted) that ended within the last ~48 h, else `{ card: null }`. Past events
 * never appear on Home otherwise.
 */
export async function GET(request: NextRequest): Promise<Response> {
  try {
    const { user, authError } = await getSupabaseFromRouteRequest(request);
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const admin = createAdminSupabaseClient();
    const feature = await requireFeature(admin, 'event_history', user.id);
    if (!feature.ok) return feature.response;
    const hours = configNumber(feature.config, 'recap_card_hours', 48, { min: 1, max: 168 });
    const now = Date.now();
    const event = recapCardEvent(await loadUserEvents(admin, user.id), now, hours);
    if (!event) return NextResponse.json({ card: null });
    const recaps = await loadRecapStates(admin, [event.beaconId]);
    return NextResponse.json({ card: serializeHistoryEvent(event, recaps.get(event.beaconId), now) });
  } catch (e) {
    console.error('GET /api/me/event-history/recap-card:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
