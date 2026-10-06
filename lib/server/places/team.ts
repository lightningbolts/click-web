import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { displayNameFromUser, type UserProfileRow } from '@/lib/events/attendeeDirectory';
import type { PlaceRole } from '@/lib/places/workspace';

export type TeamMember = {
  userId: string;
  name: string;
  avatarUrl: string | null;
  role: PlaceRole;
  /** Owners only (spec §9.5 Team). */
  email: string | null;
  since: string | null;
};

const ROLE_ORDER: Record<PlaceRole, number> = { owner: 0, manager: 1, viewer: 2 };

/** The people who manage a Place, owners first. Emails are read only when asked for. */
export async function loadPlaceTeam(admin: SupabaseClient, placeId: string, { includeEmail }: { includeEmail: boolean }): Promise<TeamMember[]> {
  const { data, error } = await admin.from('place_managers').select('user_id, role, created_at').eq('place_id', placeId);
  if (error) throw new Error(`place team: ${error.message}`);
  const rows = (data ?? []) as Array<{ user_id: string; role: PlaceRole; created_at: string | null }>;
  if (rows.length === 0) return [];
  const [{ data: users }, emails] = await Promise.all([
    admin.from('users').select('id, name, image, first_name, last_name').in('id', rows.map((r) => r.user_id)),
    includeEmail
      ? Promise.all(rows.map(async (r) => [r.user_id, (await admin.auth.admin.getUserById(r.user_id)).data.user?.email ?? null] as const))
      : Promise.resolve([] as (readonly [string, string | null])[]),
  ]);
  const byId = new Map(((users ?? []) as UserProfileRow[]).map((u) => [u.id, u]));
  const emailById = new Map(emails);
  return rows
    .map((r) => {
      const u = byId.get(r.user_id) ?? null;
      return {
        userId: r.user_id,
        name: displayNameFromUser(u, 'Click member'),
        avatarUrl: u?.image ?? null,
        role: r.role,
        email: emailById.get(r.user_id) ?? null,
        since: r.created_at,
      };
    })
    .sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.name.localeCompare(b.name));
}
