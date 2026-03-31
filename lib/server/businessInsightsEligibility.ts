import type { SupabaseClient, User } from '@supabase/supabase-js';

/** Dev allowlist — must stay in sync with any server routes that gate business tools. */
export const BUSINESS_INSIGHTS_DEV_EMAILS: readonly string[] = [
  'timberlake2025@gmail.com',
];

/**
 * Whether the user may use business insights (navbar link, /insights, and insights APIs).
 */
export async function userMayAccessBusinessInsights(
  supabase: SupabaseClient,
  user: User,
): Promise<boolean> {
  const email = user.email ?? '';
  if (BUSINESS_INSIGHTS_DEV_EMAILS.includes(email)) {
    return true;
  }

  const { data: profile, error } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (error) return false;
  return profile?.role === 'verified_business';
}
