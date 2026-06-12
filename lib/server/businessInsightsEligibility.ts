import type { SupabaseClient, User } from '@supabase/supabase-js';

/**
 * Dev allowlist comes from the environment so production deploys don't ship a
 * hardcoded paid-feature bypass. Set BUSINESS_INSIGHTS_DEV_EMAILS to a
 * comma-separated list of emails in non-production environments.
 */
function businessInsightsDevEmails(): string[] {
  const raw = process.env.BUSINESS_INSIGHTS_DEV_EMAILS ?? '';
  return raw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.length > 0);
}

function subscriptionAllowsInsights(status: string | null | undefined): boolean {
  return status === 'active' || status === 'trialing';
}

function embeddedVenueSubscription(row: {
  venues:
    | { subscription_status?: string | null }
    | { subscription_status?: string | null }[]
    | null;
}): string | null | undefined {
  const v = row.venues;
  if (Array.isArray(v)) {
    return v[0]?.subscription_status;
  }
  return v?.subscription_status;
}

/**
 * Whether the user may use business insights (navbar link, /insights, insights APIs, and middleware).
 * Allows: dev allowlist, legacy verified_business role, or B2B venue manager with active/trialing subscription.
 */
export async function userMayAccessBusinessInsights(
  supabase: SupabaseClient,
  user: User,
): Promise<boolean> {
  const email = (user.email ?? '').toLowerCase();
  if (email && businessInsightsDevEmails().includes(email)) {
    return true;
  }

  const { data: profile, error } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (!error && profile?.role === 'verified_business') {
    return true;
  }

  const { data: memberships, error: vmError } = await supabase
    .from('venue_managers')
    .select('venues!inner(subscription_status)')
    .eq('user_id', user.id);

  if (vmError) {
    return false;
  }

  return (
    memberships?.some((m) => subscriptionAllowsInsights(embeddedVenueSubscription(m))) ?? false
  );
}
