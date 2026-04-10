import type { SupabaseClient } from '@supabase/supabase-js';
import { deriveKeysForConnection, encryptContent } from '@/lib/chat/crypto';
import { findActivePairwiseConnectionId } from '@/lib/chat/groupCliqueKey';

function randomBytes32(): Uint8Array {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return b;
}

function toStdBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

function parseRpcBoolean(data: unknown): boolean {
  if (data === true) return true;
  if (data === false) return false;
  if (typeof data === 'string') {
    const t = data.trim().toLowerCase();
    return t === 'true' || t === 't' || t === '1';
  }
  return false;
}

export async function verifiedCliqueEdgesExist(
  supabase: SupabaseClient,
  memberUserIds: string[],
): Promise<boolean> {
  const ids = [...new Set(memberUserIds)].sort();
  if (ids.length < 2) return false;
  const { data, error } = await supabase.rpc('verified_clique_edges_exist', {
    p_member_ids: ids,
  });
  if (error) return false;
  return parseRpcBoolean(data);
}

/**
 * Creates a verified group chat ("click") via `create_verified_clique` (same wrapping as KMP).
 */
function firstToken(label: string): string {
  const t = label.trim();
  if (!t) return 'Friend';
  return t.split(/\s+/)[0] ?? t;
}

/** Comma-separated first tokens of display names, sorted by user id (matches mobile RPC ordering). */
export function buildInitialVerifiedClickName(
  currentUserId: string,
  currentUserLabel: string,
  selectedFriendIds: string[],
  friendNameById: Record<string, string>,
): string {
  const members = [...new Set([currentUserId, ...selectedFriendIds])].sort();
  return members
    .map((id) => {
      if (id === currentUserId) return firstToken(currentUserLabel);
      return firstToken(friendNameById[id] ?? 'Friend');
    })
    .join(', ');
}

export async function createVerifiedClickFromConnections(
  supabase: SupabaseClient,
  currentUserId: string,
  selectedFriendIds: string[],
  initialGroupName?: string,
): Promise<string> {
  const members = [...new Set([currentUserId, ...selectedFriendIds])].sort();
  if (members.length < 2) {
    throw new Error('Pick at least one friend');
  }
  const master = randomBytes32();
  const b64 = toStdBase64(master);
  const creator = currentUserId;
  const anchor = members.find((m) => m !== creator);
  if (!anchor) throw new Error('Invalid member set');
  const encrypted: Record<string, string> = {};
  for (const m of members) {
    const wrapPeer = m === creator ? anchor : creator;
    const connId = await findActivePairwiseConnectionId(supabase, m, wrapPeer);
    if (!connId) throw new Error('Missing verified connection for a member');
    const keys = await deriveKeysForConnection(connId, [m, wrapPeer].sort());
    encrypted[m] = await encryptContent(b64, keys);
  }
  const label = initialGroupName?.trim() || 'Clique';

  const { data, error } = await supabase.rpc('create_verified_clique', {
    target_user_ids: members,
    encrypted_keys: encrypted,
    initial_group_name: label,
  });
  if (error) throw new Error(error.message);
  const raw = typeof data === 'string' ? data.trim() : String(data ?? '').trim();
  if (!raw) throw new Error('Unexpected RPC response');
  return raw.replace(/^"|"$/g, '');
}

export async function leaveCliqueRpc(supabase: SupabaseClient, groupId: string): Promise<void> {
  const { error } = await supabase.rpc('leave_clique', { target_group_id: groupId });
  if (error) throw new Error(error.message);
}

export async function deleteCliqueRpc(supabase: SupabaseClient, groupId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_clique', { target_group_id: groupId });
  if (error) throw new Error(error.message);
}

export async function renameCliqueRpc(
  supabase: SupabaseClient,
  groupId: string,
  newName: string,
): Promise<void> {
  const { error } = await supabase.rpc('rename_clique', {
    target_group_id: groupId,
    new_name: newName,
  });
  if (error) throw new Error(error.message);
}
