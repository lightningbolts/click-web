import type { SupabaseClient } from '@supabase/supabase-js';
import {
  isActiveChatListStatus,
  normalizeConnectionStatus,
} from '@/lib/dashboard/connectionStatus';
import { isJunctionTableOptionalError } from '@/lib/server/connectionWriteAuth';

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

export function emptyActivityRecap(
  window: RecapWindow,
  nowMs: number = Date.now(),
): ActivityRecap {
  return {
    window,
    since: new Date(recapWindowStart(window, nowMs)).toISOString(),
    connections_formed: 0,
    messages_sent: 0,
    messages_received: 0,
    beacons_created: 0,
    events_rsvped: 0,
    events_checked_in: 0,
    events_saved: 0,
  };
}

function countOrZero(count: number | null | undefined): number {
  return typeof count === 'number' && Number.isFinite(count) ? count : 0;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value != null && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    try {
      const parsed: unknown = JSON.parse(value);
      if (parsed != null && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
  }
  return null;
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Parse a connection created timestamp without falling back to "now". */
export function recapRowTimestampMs(row: Record<string, unknown>): number | null {
  const created = asFiniteNumber(row.created);
  if (created != null && created > 0) return created;
  for (const key of ['created_utc', 'created_at'] as const) {
    const raw = row[key];
    if (typeof raw === 'string') {
      const t = Date.parse(raw);
      if (Number.isFinite(t)) return t;
    } else {
      const n = asFiniteNumber(raw);
      if (n != null && n > 0) return n;
    }
  }
  return null;
}

function isRecoverableQueryError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (error == null) return false;
  if (isJunctionTableOptionalError(error)) return true;
  const msg = String(error.message || '').toLowerCase();
  return (
    msg.includes('column') ||
    msg.includes('could not find') ||
    msg.includes('invalid input') ||
    msg.includes('json')
  );
}

async function fetchJunctionIds(
  admin: SupabaseClient,
  table: 'connection_archives' | 'connection_hidden',
  userId: string,
): Promise<string[]> {
  const { data, error } = await admin.from(table).select('connection_id').eq('user_id', userId);
  if (error) {
    if (isRecoverableQueryError(error)) return [];
    throw new Error(error.message);
  }
  return (Array.isArray(data) ? data : [])
    .map((row) => asRecord(row)?.connection_id)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);
}

async function countOrEmpty(
  query: PromiseLike<{ count?: number | null; error?: { message?: string; code?: string } | null }>,
): Promise<number> {
  try {
    const res = await query;
    if (res.error) {
      if (isRecoverableQueryError(res.error)) return 0;
      throw new Error(res.error.message);
    }
    return countOrZero(res.count);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (isRecoverableQueryError({ message })) return 0;
    throw e;
  }
}

export async function loadActivityRecap(
  admin: SupabaseClient,
  userId: string,
  window: RecapWindow,
  nowMs: number = Date.now(),
): Promise<ActivityRecap> {
  const empty = emptyActivityRecap(window, nowMs);
  if (!userId.trim()) return empty;

  try {
    const sinceMs = recapWindowStart(window, nowMs);
    const sinceIso = empty.since;

    const [archivedIds, hiddenIds, connectionResult] = await Promise.all([
      fetchJunctionIds(admin, 'connection_archives', userId),
      fetchJunctionIds(admin, 'connection_hidden', userId),
      admin
        .from('connections')
        .select('id, created, created_utc, created_at, source, status, expiry_state')
        .contains('user_ids', [userId]),
    ]);

    if (connectionResult.error) {
      if (isRecoverableQueryError(connectionResult.error)) return empty;
      throw new Error(connectionResult.error.message);
    }

    const excluded = new Set([...archivedIds, ...hiddenIds]);
    const connections = (Array.isArray(connectionResult.data) ? connectionResult.data : [])
      .map((row) => asRecord(row))
      .filter((row): row is Record<string, unknown> => row != null)
      .filter((row) => {
        const id = typeof row.id === 'string' ? row.id : '';
        if (!id || excluded.has(id)) return false;
        const source = typeof row.source === 'string' ? row.source : '';
        if (source && source !== 'handshake') return false;
        return isActiveChatListStatus(normalizeConnectionStatus(row));
      });

    const connectionsFormed = connections.filter((row) => {
      const created = recapRowTimestampMs(row);
      return created != null && created >= sinceMs;
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
      if (chatErr) {
        if (!isRecoverableQueryError(chatErr)) throw new Error(chatErr.message);
      } else {
        chatIds = (Array.isArray(chatRows) ? chatRows : [])
          .map((row) => asRecord(row)?.id)
          .filter((id): id is string => typeof id === 'string' && id.length > 0);
      }
    }

    const sentQuery = admin
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('time_created', sinceMs);

    const receivedQuery =
      chatIds.length > 0
        ? admin
            .from('messages')
            .select('id', { count: 'exact', head: true })
            .in('chat_id', chatIds)
            .neq('user_id', userId)
            .gte('time_created', sinceMs)
        : null;

    const [messagesSent, messagesReceived, beaconsCreated, eventsRsvped, eventsCheckedIn, eventsSaved] =
      await Promise.all([
        countOrEmpty(sentQuery),
        receivedQuery ? countOrEmpty(receivedQuery) : Promise.resolve(0),
        countOrEmpty(
          admin
            .from('map_beacons')
            .select('id', { count: 'exact', head: true })
            .eq('creator_id', userId)
            .gte('created_at', sinceIso),
        ),
        countOrEmpty(
          admin
            .from('beacon_attendees')
            .select('beacon_id', { count: 'exact', head: true })
            .eq('user_id', userId)
            .gte('created_at', sinceIso),
        ),
        countOrEmpty(
          admin
            .from('event_check_ins')
            .select('beacon_id', { count: 'exact', head: true })
            .eq('user_id', userId)
            .gte('checked_in_at', sinceIso),
        ),
        countOrEmpty(
          admin
            .from('event_bookmarks')
            .select('beacon_id', { count: 'exact', head: true })
            .eq('user_id', userId)
            .gte('created_at', sinceIso),
        ),
      ]);

    return {
      window,
      since: sinceIso,
      connections_formed: connectionsFormed,
      messages_sent: messagesSent,
      messages_received: messagesReceived,
      beacons_created: beaconsCreated,
      events_rsvped: eventsRsvped,
      events_checked_in: eventsCheckedIn,
      events_saved: eventsSaved,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (isRecoverableQueryError({ message })) {
      return empty;
    }
    throw e;
  }
}
