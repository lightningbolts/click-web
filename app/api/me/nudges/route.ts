import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseFromRouteRequest } from '@/lib/server/supabaseRouteAuth';
import { createAdminSupabaseClient } from '@/lib/server/admin/supabaseAdmin';
import { reconnectNudgeCopy, sharedEventNudgeCopy } from '@/lib/cron/nudgesReconnect';

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function serializeNudge(row: Record<string, unknown>) {
  const payload = isRecord(row.payload) ? row.payload : {};
  const peerFirstName =
    typeof payload.peer_first_name === 'string' ? payload.peer_first_name : 'a connection';
  const type = row.nudge_type === 'shared_upcoming_event' ? 'shared_upcoming_event' : 'reconnect_lull';
  const copy =
    type === 'shared_upcoming_event'
      ? sharedEventNudgeCopy({
          peerFirstName,
          eventTitle: typeof payload.event_title === 'string' ? payload.event_title : 'an upcoming event',
        })
      : reconnectNudgeCopy({
          peerFirstName,
          daysSinceEncounter:
            typeof payload.days_since_encounter === 'number' ? payload.days_since_encounter : 21,
        });
  return {
    id: row.id,
    nudge_type: type,
    connection_id: typeof row.connection_id === 'string' ? row.connection_id : null,
    beacon_id: typeof row.beacon_id === 'string' ? row.beacon_id : null,
    headline: copy.title,
    body: copy.body,
    payload,
    sent_at: row.sent_at,
  };
}

/**
 * GET /api/me/nudges — undismissed nudges for the current user.
 */
export async function GET(request: NextRequest) {
  try {
    const { user, authError } = await getSupabaseFromRouteRequest(request);
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const admin = createAdminSupabaseClient();
    const { data, error } = await admin
      .from('nudges')
      .select('id, nudge_type, connection_id, beacon_id, payload, sent_at')
      .eq('user_id', user.id)
      .is('dismissed_at', null)
      .order('sent_at', { ascending: false })
      .limit(20);
    if (error) {
      console.error('GET /api/me/nudges:', error.message);
      return NextResponse.json({ error: 'Failed to load nudges' }, { status: 500 });
    }
    const nudges = (data ?? [])
      .filter(isRecord)
      .map(serializeNudge)
      .filter((n) => typeof n.id === 'string');
    return NextResponse.json({ nudges });
  } catch (e) {
    console.error('GET /api/me/nudges:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
