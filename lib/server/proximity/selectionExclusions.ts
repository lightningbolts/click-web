import type { SupabaseClient } from '@supabase/supabase-js';
import { PROXIMITY_HOST_SELECTION_MAX_MEMBERS } from '@/lib/server/proximity/matching';
import type { ProximitySelectionExclusionsRequest } from '@/types/supabase-json';

type ExclusionsResult =
  | { kind: 'ok'; status: 200; body: { success: true; excluded_member_ids: string[] } }
  | { kind: 'error'; status: number; body: { error: string } };

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** The ids a pending row's owner removed while reviewing a group tap. */
export function excludedMemberIdsFromPayload(payload: unknown): string[] {
  if (!isRecord(payload) || !Array.isArray(payload.excluded_member_ids)) return [];
  return payload.excluded_member_ids.filter((id): id is string => typeof id === 'string' && id.length > 0);
}

/**
 * Applies everyone's removals to a selected member set. If A removed B, A and B never end up
 * in the same group: B is dropped, unless B is the confirmer, in which case A is dropped.
 */
export function applyMemberExclusions(
  confirmerId: string,
  selected: readonly string[],
  exclusionsByMember: ReadonlyMap<string, readonly string[]>,
): string[] {
  const kept = new Set(selected);
  const order = [confirmerId, ...[...selected].filter((id) => id !== confirmerId).sort()];
  for (const memberId of order) {
    if (!kept.has(memberId)) continue;
    for (const excludedId of exclusionsByMember.get(memberId) ?? []) {
      if (excludedId === memberId || !kept.has(excludedId)) continue;
      if (excludedId === confirmerId) {
        kept.delete(memberId);
        break;
      }
      kept.delete(excludedId);
    }
  }
  return [...kept].sort();
}

/**
 * Stores the caller's removals on their unmatched pending handshake so whichever phone
 * confirms the group honours them.
 */
export async function recordProximitySelectionExclusions(
  admin: SupabaseClient,
  uid: string,
  body: ProximitySelectionExclusionsRequest,
): Promise<ExclusionsResult> {
  const pendingId = body.pending_handshake_id.trim();
  const excluded = [
    ...new Set(
      body.excluded_member_ids
        .map((id) => (typeof id === 'string' ? id.trim() : ''))
        .filter((id) => id.length > 0 && id !== uid),
    ),
  ]
    .sort()
    .slice(0, PROXIMITY_HOST_SELECTION_MAX_MEMBERS);

  const { data: row, error } = await admin
    .from('pending_handshakes')
    .select('id, sensor_payload, matched_at')
    .eq('id', pendingId)
    .eq('user_id', uid)
    .maybeSingle();
  if (error) {
    console.error('[proximity/selection] pending lookup:', error.message);
    return { kind: 'error', status: 500, body: { error: 'Failed to load pending handshake' } };
  }
  if (!row) return { kind: 'error', status: 404, body: { error: 'Pending handshake not found' } };
  if (row.matched_at != null) {
    return { kind: 'error', status: 409, body: { error: 'Handshake already finalized' } };
  }

  const payload = isRecord(row.sensor_payload) ? row.sensor_payload : {};
  const { error: updateErr } = await admin
    .from('pending_handshakes')
    .update({ sensor_payload: { ...payload, excluded_member_ids: excluded } })
    .eq('id', pendingId)
    .eq('user_id', uid)
    .is('matched_at', null);
  if (updateErr) {
    console.error('[proximity/selection] update:', updateErr.message);
    return { kind: 'error', status: 500, body: { error: 'Failed to save selection' } };
  }
  return { kind: 'ok', status: 200, body: { success: true, excluded_member_ids: excluded } };
}
