import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * True only when every member has `users.location_include_in_insights_enabled = true`.
 * Snapshotted at write time onto `connections.include_in_business_insights` so venue/Place
 * stats never count a connection whose members opted out. Fails closed on read errors.
 */
export async function allMembersOptedIntoInsights(
  admin: SupabaseClient,
  userIds: string[],
): Promise<boolean> {
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return false;
  const { data, error } = await admin
    .from('users')
    .select('id, location_include_in_insights_enabled')
    .in('id', unique);
  if (error || !data) return false;
  const rows = data as { id: string; location_include_in_insights_enabled?: boolean | null }[];
  return rows.length === unique.length && rows.every((r) => r.location_include_in_insights_enabled === true);
}
