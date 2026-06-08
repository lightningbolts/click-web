import type { SupabaseClient } from '@supabase/supabase-js';
import { deriveKeysForConnection, encryptContent } from '@/lib/chat/crypto';
import { findActivePairwiseConnectionId, unwrapGroupMasterKeyBytes } from '@/lib/chat/groupCliqueKey';

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

/**
 * Adds a member to a verified clique: server unwraps the group master key for the
 * creator and re-wraps it for the new member (thin client / fat server).
 */
export async function addCliqueMemberFromConnections(
  supabase: SupabaseClient,
  currentUserId: string,
  groupId: string,
  newMemberUserId: string,
): Promise<void> {
  const trimmedGroup = groupId.trim();
  const trimmedMember = newMemberUserId.trim();
  if (!trimmedGroup || !trimmedMember) throw new Error('group_id and new_member_user_id are required');

  const { data: group, error: gErr } = await supabase
    .from('groups')
    .select('id, created_by, key_anchor_user_id')
    .eq('id', trimmedGroup)
    .maybeSingle();
  if (gErr) throw new Error(gErr.message);
  if (!group) throw new Error('Group not found');

  const { data: callerMember, error: callerErr } = await supabase
    .from('group_members')
    .select('user_id')
    .eq('group_id', trimmedGroup)
    .eq('user_id', currentUserId)
    .maybeSingle();
  if (callerErr) throw new Error(callerErr.message);
  if (!callerMember) throw new Error('Must be a group member to add others');

  const { data: members, error: mErr } = await supabase
    .from('group_members')
    .select('user_id')
    .eq('group_id', trimmedGroup);
  if (mErr) throw new Error(mErr.message);
  const memberIds = (members ?? []).map((r) => String((r as { user_id: string }).user_id));
  if (memberIds.includes(trimmedMember)) throw new Error('User is already a member');

  const expanded = [...new Set([...memberIds, trimmedMember])].sort();
  if (!(await verifiedCliqueEdgesExist(supabase, expanded))) {
    throw new Error('Missing verified connection for new member');
  }

  const master = await unwrapGroupMasterKeyBytes(supabase, {
    groupId: trimmedGroup,
    viewerUserId: currentUserId,
  });
  if (!master) throw new Error('Could not access group encryption key');

  const b64 = toStdBase64(new Uint8Array(master));
  const createdBy = String((group as { created_by: string }).created_by);
  const keyAnchorUserId = (group as { key_anchor_user_id: string | null }).key_anchor_user_id;
  const wrapPeer = trimmedMember === createdBy ? keyAnchorUserId : createdBy;
  if (!wrapPeer) throw new Error('Invalid group key anchor');
  const connId = await findActivePairwiseConnectionId(supabase, trimmedMember, wrapPeer);
  if (!connId) throw new Error('Missing verified connection for new member');
  const keys = await deriveKeysForConnection(connId, [trimmedMember, wrapPeer].sort());
  const encrypted = await encryptContent(b64, keys);

  const { error } = await supabase.rpc('add_clique_member', {
    target_group_id: trimmedGroup,
    new_member_user_id: trimmedMember,
    encrypted_group_key: encrypted,
  });
  if (error) throw new Error(error.message);
}

export async function removeCliqueMemberRpc(
  supabase: SupabaseClient,
  groupId: string,
  memberUserId: string,
): Promise<void> {
  const { error } = await supabase.rpc('remove_clique_member', {
    target_group_id: groupId.trim(),
    member_user_id: memberUserId.trim(),
  });
  if (error) throw new Error(error.message);
}
