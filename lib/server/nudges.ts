import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { NUDGE_TYPES, nudgeCopy } from '@/lib/nudges/moments';
import type { HomeNudge } from '@/lib/dashboard/homeFeed';

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

export type SerializedNudge = HomeNudge & { sent_at: unknown };

function serializeNudge(row: Record<string, unknown>): SerializedNudge {
  const payload = isRecord(row.payload) ? row.payload : {};
  const type = NUDGE_TYPES.find((t) => t === row.nudge_type) ?? 'reconnect_lull';
  const copy = nudgeCopy(type, payload);
  return {
    id: row.id as string,
    nudge_type: type,
    connection_id: typeof row.connection_id === 'string' ? row.connection_id : null,
    beacon_id: typeof row.beacon_id === 'string' ? row.beacon_id : null,
    headline: copy.title,
    body: copy.body,
    payload,
    sent_at: row.sent_at,
  };
}

/** Undismissed nudges for the user, newest first (every relationship moment kind). */
export async function loadNudges(admin: SupabaseClient, userId: string): Promise<SerializedNudge[]> {
  const { data, error } = await admin
    .from('nudges')
    .select('id, nudge_type, connection_id, beacon_id, payload, sent_at')
    .eq('user_id', userId)
    .is('dismissed_at', null)
    .order('sent_at', { ascending: false })
    .limit(20);
  if (error) throw new Error(`nudges: ${error.message}`);
  return (data ?? [])
    .filter(isRecord)
    .filter((r) => typeof r.id === 'string')
    .map(serializeNudge);
}
