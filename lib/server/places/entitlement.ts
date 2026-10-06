import type { SupabaseClient, User } from '@supabase/supabase-js';

/**
 * Insights is paid per Place (spec §9.7, decision D1): the Stripe subscription lives on the
 * Place row, so paying for one Place never unlocks another.
 */
export function placeHasInsights(place: { subscription_status: string | null | undefined }): boolean {
  return place.subscription_status === 'active' || place.subscription_status === 'trialing';
}

/** Comma-separated BUSINESS_INSIGHTS_DEV_EMAILS (non-production override). */
function devEmails(): string[] {
  return (process.env.BUSINESS_INSIGHTS_DEV_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

function embeddedStatus(places: unknown): string | null {
  const row = Array.isArray(places) ? places[0] : places;
  const status = (row as { subscription_status?: unknown } | null)?.subscription_status;
  return typeof status === 'string' ? status : null;
}

/**
 * May this user see paid Insights for this Place? The dev allowlist and the legacy
 * `users.role = 'verified_business'` still override; otherwise the user must manage the Place
 * and the Place must have an active or trialing subscription.
 */
export async function userMayViewPlaceInsights(
  supabase: SupabaseClient,
  user: Pick<User, 'id' | 'email'>,
  placeId: string,
): Promise<boolean> {
  const email = (user.email ?? '').toLowerCase();
  if (email && devEmails().includes(email)) return true;

  const [{ data: profile }, { data: membership, error }] = await Promise.all([
    supabase.from('users').select('role').eq('id', user.id).maybeSingle(),
    supabase
      .from('place_managers')
      .select('places!inner(subscription_status)')
      .eq('user_id', user.id)
      .eq('place_id', placeId)
      .maybeSingle(),
  ]);
  if ((profile as { role?: string } | null)?.role === 'verified_business') return true;
  if (error || !membership) return false;
  return placeHasInsights({ subscription_status: embeddedStatus((membership as { places: unknown }).places) });
}
