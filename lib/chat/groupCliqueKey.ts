/**
 * Unwrap the 32-byte group master key for a verified clique (same rules as KMP SupabaseChatRepository).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  decodeGroupMasterKeyBase64,
  decryptContent,
  deriveKeysForConnection,
} from '@/lib/chat/crypto';

type ConnectionRow = {
  id: string;
  user_ids: string[] | null;
  status: string | null;
  source: string | null;
};

/**
 * A 1:1 edge counts for verified groups when it is visible as a connection: active/kept, or a
 * fresh in-person Click still in its `pending` say-hi window. An unanswered "met before"
 * request (`source = 'prior'`) does not. Mirrors SQL `public.is_verified_pair`.
 */
export function isVerifiedPairConnection(row: { status: string | null; source: string | null }): boolean {
  return row.status === 'active' || row.status === 'kept' || (row.status === 'pending' && row.source !== 'prior');
}

export async function findActivePairwiseConnectionId(
  supabase: SupabaseClient,
  userA: string,
  userB: string,
): Promise<string | null> {
  if (!userA || !userB || userA === userB) return null;
  const { data, error } = await supabase
    .from('connections')
    .select('id, user_ids, status, source')
    .contains('user_ids', [userA, userB])
    .in('status', ['active', 'kept', 'pending']);

  if (error || !data?.length) return null;

  const match = (data as ConnectionRow[]).find(
    (r) =>
      isVerifiedPairConnection(r) &&
      Array.isArray(r.user_ids) &&
      r.user_ids.length === 2 &&
      r.user_ids.includes(userA) &&
      r.user_ids.includes(userB),
  );
  return match?.id ?? null;
}

/**
 * Fetch `encrypted_group_key` for the viewer and decrypt using the 1:1 channel with the key anchor peer.
 */
export async function unwrapGroupMasterKeyBytes(
  supabase: SupabaseClient,
  params: { groupId: string; viewerUserId: string },
): Promise<ArrayBuffer | null> {
  const { groupId, viewerUserId } = params;
  try {
    const { data: group, error: gErr } = await supabase
      .from('groups')
      .select('id, created_by, key_anchor_user_id')
      .eq('id', groupId)
      .maybeSingle();

    if (gErr || !group) return null;

    const createdBy = String((group as { created_by: string }).created_by);
    const keyAnchorUserId = (group as { key_anchor_user_id: string | null }).key_anchor_user_id;

    const { data: memberRow, error: mErr } = await supabase
      .from('group_members')
      .select('encrypted_group_key')
      .eq('group_id', groupId)
      .eq('user_id', viewerUserId)
      .maybeSingle();

    if (mErr || !memberRow) return null;

    const enc = String((memberRow as { encrypted_group_key: string }).encrypted_group_key ?? '').trim();
    if (!enc) return null;

    const wrapPeer =
      viewerUserId === createdBy ? keyAnchorUserId : createdBy;
    if (!wrapPeer) return null;

    const connectionId = await findActivePairwiseConnectionId(supabase, viewerUserId, wrapPeer);
    if (!connectionId) return null;

    const keys = await deriveKeysForConnection(connectionId, [viewerUserId, wrapPeer].sort());
    const plain = await decryptContent(enc, keys);
    return decodeGroupMasterKeyBase64(plain);
  } catch {
    return null;
  }
}
