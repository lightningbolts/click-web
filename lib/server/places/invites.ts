import 'server-only';

import { createHash, randomBytes } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { publicOrigin } from '@/lib/events/eventUrls';
import type { PlaceRole } from '@/lib/places/workspace';

/** Invites are good for two weeks (matches the column default). */
export const INVITE_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export type PendingInvite = { id: string; email: string; role: PlaceRole; createdAt: string; expiresAt: string; expired: boolean };

export function hashInviteToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function newInviteToken(): string {
  return randomBytes(32).toString('base64url');
}

export function inviteUrl(token: string): string {
  return `${publicOrigin()}/business/invite/${encodeURIComponent(token)}`;
}

export function normalizeEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 320 ? email : null;
}

/**
 * The last-owner guard (spec §9.5): a Place always keeps at least one owner, so its only owner
 * can't be removed (`next = null`) or moved to another role.
 */
export function lastOwnerBlocks(ownerCount: number, current: PlaceRole, next: PlaceRole | null): boolean {
  return current === 'owner' && next !== 'owner' && ownerCount <= 1;
}

export async function countOwners(admin: SupabaseClient, placeId: string): Promise<number> {
  const { count, error } = await admin
    .from('place_managers')
    .select('user_id', { count: 'exact', head: true })
    .eq('place_id', placeId)
    .eq('role', 'owner');
  if (error) throw new Error(`owners: ${error.message}`);
  return count ?? 0;
}

export async function loadPendingInvites(admin: SupabaseClient, placeId: string, nowMs = Date.now()): Promise<PendingInvite[]> {
  const { data, error } = await admin
    .from('place_manager_invites')
    .select('id, email, role, created_at, expires_at')
    .eq('place_id', placeId)
    .is('accepted_at', null)
    .is('revoked_at', null)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`invites: ${error.message}`);
  return ((data ?? []) as Array<{ id: string; email: string; role: PlaceRole; created_at: string; expires_at: string }>).map((r) => ({
    id: r.id,
    email: r.email,
    role: r.role,
    createdAt: r.created_at,
    expiresAt: r.expires_at,
    expired: Date.parse(r.expires_at) <= nowMs,
  }));
}

/**
 * Creates (or re-sends) an invite: any open invite for the same address is revoked first, so the
 * newest link is the only one that works. Returns the raw token once, for the email and the
 * owner's copyable link; only its hash is stored.
 */
export async function createInvite(
  admin: SupabaseClient,
  args: { placeId: string; email: string; role: PlaceRole; invitedBy: string; nowMs?: number },
): Promise<{ token: string; invite: PendingInvite }> {
  const nowMs = args.nowMs ?? Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const { error: revokeError } = await admin
    .from('place_manager_invites')
    .update({ revoked_at: nowIso })
    .eq('place_id', args.placeId)
    .eq('email', args.email)
    .is('accepted_at', null)
    .is('revoked_at', null);
  if (revokeError) throw new Error(`invite revoke: ${revokeError.message}`);

  const token = newInviteToken();
  const { data, error } = await admin
    .from('place_manager_invites')
    .insert({
      place_id: args.placeId,
      email: args.email,
      role: args.role,
      invited_by: args.invitedBy,
      token_hash: hashInviteToken(token),
      expires_at: new Date(nowMs + INVITE_TTL_MS).toISOString(),
    })
    .select('id, email, role, created_at, expires_at')
    .single();
  if (error || !data) throw new Error(`invite insert: ${error?.message ?? 'no row'}`);
  const row = data as { id: string; email: string; role: PlaceRole; created_at: string; expires_at: string };
  return {
    token,
    invite: { id: row.id, email: row.email, role: row.role, createdAt: row.created_at, expiresAt: row.expires_at, expired: false },
  };
}

/**
 * Emails the invite through Supabase Auth: an invite email for someone new to Click, a sign-in
 * link for an existing account. Both land on the accept page. Best effort: the owner always gets
 * the link to share too.
 */
export async function emailInvite(admin: SupabaseClient, email: string, token: string): Promise<boolean> {
  const redirectTo = inviteUrl(token);
  const invited = await admin.auth.admin.inviteUserByEmail(email, { redirectTo });
  if (!invited.error) return true;
  // Already registered: send a sign-in link to the same page instead.
  const link = await admin.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: redirectTo } });
  if (link.error) console.warn('[place invite] email:', link.error.message);
  return !link.error;
}

export type InviteLookup =
  | { kind: 'missing' }
  | { kind: 'used' }
  | { kind: 'expired' }
  | { kind: 'ok'; id: string; placeId: string; placeName: string; email: string; role: PlaceRole };

/** An invite by its raw token (accept page and route). */
export async function loadInviteByToken(admin: SupabaseClient, token: string, nowMs = Date.now()): Promise<InviteLookup> {
  if (!token || token.length > 200) return { kind: 'missing' };
  const { data, error } = await admin
    .from('place_manager_invites')
    .select('id, place_id, email, role, expires_at, accepted_at, revoked_at, places!inner(name)')
    .eq('token_hash', hashInviteToken(token))
    .maybeSingle();
  if (error) throw new Error(`invite lookup: ${error.message}`);
  const row = data as {
    id: string;
    place_id: string;
    email: string;
    role: PlaceRole;
    expires_at: string;
    accepted_at: string | null;
    revoked_at: string | null;
    places: { name: string } | { name: string }[];
  } | null;
  if (!row || row.revoked_at) return { kind: 'missing' };
  if (row.accepted_at) return { kind: 'used' };
  if (Date.parse(row.expires_at) <= nowMs) return { kind: 'expired' };
  const place = Array.isArray(row.places) ? row.places[0] : row.places;
  return { kind: 'ok', id: row.id, placeId: row.place_id, placeName: place?.name ?? 'this Place', email: row.email, role: row.role };
}

/**
 * Accepts for the signed-in user whose email matches the invite. Joining never lowers a role the
 * user already has at this Place.
 */
export async function acceptInvite(
  admin: SupabaseClient,
  invite: Extract<InviteLookup, { kind: 'ok' }>,
  user: { id: string; email: string | null },
  nowMs = Date.now(),
): Promise<'accepted' | 'wrong_email'> {
  if ((user.email ?? '').toLowerCase() !== invite.email.toLowerCase()) return 'wrong_email';
  const rank: Record<PlaceRole, number> = { viewer: 0, manager: 1, owner: 2 };
  const { data: existing } = await admin
    .from('place_managers')
    .select('role')
    .eq('place_id', invite.placeId)
    .eq('user_id', user.id)
    .maybeSingle();
  const current = (existing as { role?: PlaceRole } | null)?.role ?? null;
  if (!current) {
    const { error } = await admin.from('place_managers').insert({ place_id: invite.placeId, user_id: user.id, role: invite.role });
    if (error && error.code !== '23505') throw new Error(`invite join: ${error.message}`);
  } else if (rank[invite.role] > rank[current]) {
    const { error } = await admin.from('place_managers').update({ role: invite.role }).eq('place_id', invite.placeId).eq('user_id', user.id);
    if (error) throw new Error(`invite upgrade: ${error.message}`);
  }
  const { error } = await admin
    .from('place_manager_invites')
    .update({ accepted_at: new Date(nowMs).toISOString(), accepted_by: user.id })
    .eq('id', invite.id)
    .is('accepted_at', null);
  if (error) throw new Error(`invite accept: ${error.message}`);
  return 'accepted';
}
