import type { SupabaseClient } from '@supabase/supabase-js';
import { isDuplicateKeyError, sameMemberSet, utcTimeOfDayLabelFromMs } from '@/lib/server/proximity/matching';

export async function lookupConnectionForMemberSet(
  admin: SupabaseClient,
  memberUserIds: string[],
  createdAfterIso?: string,
): Promise<{ id: string; user_ids: string[]; is_group?: boolean | null; created?: number | null } | null> {
  let query = admin
    .from('connections')
    .select('id, user_ids, is_group, created')
    .contains('user_ids', memberUserIds);
  if (createdAfterIso) {
    query = query.gte('created_utc', createdAfterIso);
  }
  const { data, error } = await query;
  if (error || !data?.length) return null;
  const connRows = data as { id: string; user_ids?: string[]; is_group?: boolean | null; created?: number | null }[];
  const found = connRows.find((r) => sameMemberSet(r.user_ids, memberUserIds));
  if (!found?.id) return null;
  return { id: found.id, user_ids: found.user_ids ?? [], is_group: found.is_group, created: found.created };
}

/**
 * Find-or-create the connection row (plus chat) for a member set. `uid` is the
 * binding caller (recorded as initiator/responder); `encLat`/`encLon` only feed
 * the proximity-confidence heuristic for brand-new rows.
 */
export async function ensureConnectionForMemberSet(
  admin: SupabaseClient,
  uid: string,
  encLat: number | null,
  encLon: number | null,
  memberUserIds: string[],
  options?: { forceActive?: boolean },
): Promise<{ connectionId: string; isNewConnection: boolean; isGroup: boolean } | null> {
  const members = [...new Set(memberUserIds)].sort();
  const forceActive = options?.forceActive === true || members.length > 2;
  const existing = await lookupConnectionForMemberSet(admin, members);
  if (existing?.id) {
    if (forceActive) {
      const { error: promoteErr } = await admin
        .from('connections')
        .update({ status: 'active', expiry_state: 'active' })
        .eq('id', existing.id)
        .eq('status', 'pending');
      if (promoteErr) {
        console.warn('[proximity] ensureConnection promote active:', promoteErr.message);
      }
    }
    return { connectionId: String(existing.id), isNewConnection: false, isGroup: members.length > 2 };
  }
  const nowMs = Date.now();
  const expiryMs = nowMs + 30 * 24 * 60 * 60 * 1000;
  const hasGps = encLat != null && encLon != null;
  const proximityConfidence = hasGps ? 65 : 50;
  const insertRow: Record<string, unknown> = {
    user_ids: members,
    created: nowMs,
    expiry: expiryMs,
    should_continue: members.map(() => false),
    has_begun: false,
    expiry_state: forceActive ? 'active' : 'pending',
    status: forceActive ? 'active' : 'pending',
    include_in_business_insights: true,
    initiator_id: uid,
    responder_id: uid,
    connection_method: 'proximity',
    proximity_confidence: proximityConfidence,
    flagged: proximityConfidence < 20,
    proximity_signals: {
      connection_method: 'proximity',
      gps_available: hasGps,
      bind_source: 'api-connections-proximity',
    },
    created_utc: new Date(nowMs).toISOString(),
    time_of_day_utc: utcTimeOfDayLabelFromMs(nowMs),
    is_group: members.length > 2,
  };
  const { data: ins, error: connInsErr } = await admin.from('connections').insert(insertRow).select('id').single();
  if (connInsErr || !ins?.id) {
    if (isDuplicateKeyError(connInsErr)) {
      const retry = await lookupConnectionForMemberSet(admin, members);
      if (retry?.id) {
        if (forceActive) {
          await admin
            .from('connections')
            .update({ status: 'active', expiry_state: 'active' })
            .eq('id', retry.id)
            .eq('status', 'pending');
        }
        return { connectionId: String(retry.id), isNewConnection: false, isGroup: members.length > 2 };
      }
    }
    console.error('[proximity] ensureConnection insert:', connInsErr);
    return null;
  }
  const connectionId = String(ins.id);
  const { error: chatErr } = await admin.from('chats').insert({
    connection_id: connectionId,
    created_at: nowMs,
    updated_at: nowMs,
  });
  if (chatErr && !isDuplicateKeyError(chatErr)) {
    console.warn('[proximity] ensureConnection chat:', chatErr.message);
  }
  return { connectionId, isNewConnection: true, isGroup: members.length > 2 };
}
