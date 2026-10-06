import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { displayNameFromUser, type UserProfileRow } from '@/lib/events/attendeeDirectory';
import { canonicalizePersonalityTags } from '@/lib/personality/taxonomy';

/** Server reads for `/settings/[section]` (spec §7.8): first paint shows saved values, no spinners. */

export type ProfileSettings = {
  firstName: string;
  lastName: string;
  bio: string;
  birthday: string | null;
  image: string | null;
};

type UserRow = {
  first_name: string | null;
  last_name: string | null;
  name: string | null;
  bio?: string | null;
  birthday: string | null;
  image: string | null;
};

export async function loadProfileSettings(admin: SupabaseClient, userId: string): Promise<ProfileSettings> {
  let res = await admin.from('users').select('first_name, last_name, name, bio, birthday, image').eq('id', userId).maybeSingle();
  // `bio` is additive (20260924120000); read without it until the migration lands.
  if (res.error?.code === '42703') {
    res = await admin.from('users').select('first_name, last_name, name, birthday, image').eq('id', userId).maybeSingle();
  }
  if (res.error) throw new Error(`profile settings: ${res.error.message}`);
  const row = (res.data as UserRow | null) ?? null;
  const [fallbackFirst, ...rest] = (row?.name ?? '').trim().split(/\s+/);
  return {
    firstName: row?.first_name?.trim() || fallbackFirst || '',
    lastName: row?.last_name?.trim() ?? rest.join(' '),
    bio: row?.bio ?? '',
    birthday: row?.birthday ?? null,
    image: row?.image ?? null,
  };
}

export async function loadInterestTags(admin: SupabaseClient, userId: string): Promise<string[]> {
  const { data, error } = await admin.from('user_interests').select('tags').eq('user_id', userId).maybeSingle();
  if (error) throw new Error(`interest settings: ${error.message}`);
  const tags = (data as { tags?: unknown } | null)?.tags;
  return Array.isArray(tags) ? tags.filter((t): t is string => typeof t === 'string') : [];
}

export async function loadPersonalityTags(admin: SupabaseClient, userId: string): Promise<string[]> {
  const { data, error } = await admin.from('users').select('personality_tags').eq('id', userId).maybeSingle();
  if (error) throw new Error(`personality settings: ${error.message}`);
  const tags = (data as { personality_tags?: unknown } | null)?.personality_tags;
  return Array.isArray(tags) ? canonicalizePersonalityTags(tags.filter((t): t is string => typeof t === 'string')) : [];
}

export type LocationPrefs = {
  location_connection_snap_enabled: boolean;
  location_show_on_map_enabled: boolean;
  location_include_in_insights_enabled: boolean;
};

export async function loadLocationPrefs(admin: SupabaseClient, userId: string): Promise<LocationPrefs> {
  const { data, error } = await admin
    .from('users')
    .select('location_connection_snap_enabled, location_show_on_map_enabled, location_include_in_insights_enabled')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw new Error(`location settings: ${error.message}`);
  const row = (data as Partial<Record<keyof LocationPrefs, boolean | null>> | null) ?? {};
  // Defaults match the columns: on unless turned off.
  return {
    location_connection_snap_enabled: row.location_connection_snap_enabled ?? true,
    location_show_on_map_enabled: row.location_show_on_map_enabled ?? true,
    location_include_in_insights_enabled: row.location_include_in_insights_enabled ?? true,
  };
}

export async function loadOwnPhone(admin: SupabaseClient, userId: string): Promise<string | null> {
  const { data, error } = await admin.from('users').select('phone_e164').eq('id', userId).maybeSingle();
  if (error) return null;
  const phone = (data as { phone_e164?: unknown } | null)?.phone_e164;
  return typeof phone === 'string' && phone ? phone : null;
}

export type BlockedPerson = { id: string; name: string; avatarUrl: string | null; blockedAt: string | null };

export async function loadBlockedPeople(admin: SupabaseClient, userId: string): Promise<BlockedPerson[]> {
  const { data, error } = await admin
    .from('user_blocks')
    .select('blocked_id, created_at')
    .eq('blocker_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`blocked settings: ${error.message}`);
  const rows = (data ?? []) as Array<{ blocked_id: string; created_at: string | null }>;
  if (rows.length === 0) return [];
  const { data: users } = await admin
    .from('users')
    .select('id, name, image, first_name, last_name')
    .in('id', rows.map((r) => r.blocked_id));
  const byId = new Map(((users ?? []) as UserProfileRow[]).map((u) => [u.id, u]));
  return rows.map((r) => {
    const u = byId.get(r.blocked_id) ?? null;
    return { id: r.blocked_id, name: displayNameFromUser(u, 'Click member'), avatarUrl: u?.image ?? null, blockedAt: r.created_at };
  });
}
