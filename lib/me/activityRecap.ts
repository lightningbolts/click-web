import type { SupabaseClient } from '@supabase/supabase-js';

export type RecapWindow = 'day' | 'week';

export type ActivityRecap = {
  window: RecapWindow;
  since: string;
  connections_formed: number;
  messages_sent: number;
  messages_received: number;
  beacons_created: number;
  events_rsvped: number;
  events_checked_in: number;
  events_saved: number;
};

export function recapWindowStart(window: RecapWindow, nowMs: number): number {
  const ms = window === 'day' ? 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
  return nowMs - ms;
}

function countOrZero(count: number | null | undefined): number {
  return typeof count === 'number' && Number.isFinite(count) ? count : 0;
}

export async function loadActivityRecap(
  admin: SupabaseClient,
  userId: string,
  window: RecapWindow,
  nowMs: number = Date.now(),
): Promise<ActivityRecap> {
  const sinceMs = recapWindowStart(window, nowMs);
  const sinceIso = new Date(sinceMs).toISOString();

  const { data: connectionRows, error: connErr } = await admin
    .from('connections')
    .select('id, created')
    .contains('user_ids', [userId]);
  if (connErr) throw new Error(connErr.message);

  const connections = Array.isArray(connectionRows) ? connectionRows : [];
  const connectionsFormed = connections.filter((row) => {
    const created = typeof row.created === 'number' ? row.created : Number(row.created);
    return Number.isFinite(created) && created >= sinceMs;
  }).length;
  const connectionIds = connections
    .map((row) => (typeof row.id === 'string' ? row.id : ''))
    .filter(Boolean);

  let chatIds: string[] = [];
  if (connectionIds.length > 0) {
    const { data: chatRows, error: chatErr } = await admin
      .from('chats')
      .select('id')
      .in('connection_id', connectionIds);
    if (chatErr) throw new Error(chatErr.message);
    chatIds = (chatRows ?? [])
      .map((row) => (typeof row.id === 'string' ? row.id : ''))
      .filter(Boolean);
  }

  const sentQuery = admin
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', sinceMs);

  const receivedQuery =
    chatIds.length > 0
      ? admin
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .in('chat_id', chatIds)
          .neq('user_id', userId)
          .gte('created_at', sinceMs)
      : null;

  const [sentRes, receivedRes, beaconsRes, rsvpRes, checkInRes, savedRes] = await Promise.all([
    sentQuery,
    receivedQuery ?? Promise.resolve({ count: 0, error: null }),
    admin
      .from('map_beacons')
      .select('id', { count: 'exact', head: true })
      .eq('creator_id', userId)
      .gte('created_at', sinceIso),
    admin
      .from('beacon_attendees')
      .select('beacon_id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', sinceIso),
    admin
      .from('event_check_ins')
      .select('beacon_id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('checked_in_at', sinceIso),
    admin
      .from('event_bookmarks')
      .select('beacon_id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', sinceIso),
  ]);

  const firstError =
    sentRes.error ??
    receivedRes.error ??
    beaconsRes.error ??
    rsvpRes.error ??
    checkInRes.error ??
    savedRes.error;
  if (firstError) {
    throw new Error(firstError.message);
  }

  return {
    window,
    since: sinceIso,
    connections_formed: connectionsFormed,
    messages_sent: countOrZero(sentRes.count),
    messages_received: countOrZero(receivedRes.count),
    beacons_created: countOrZero(beaconsRes.count),
    events_rsvped: countOrZero(rsvpRes.count),
    events_checked_in: countOrZero(checkInRes.count),
    events_saved: countOrZero(savedRes.count),
  };
}
