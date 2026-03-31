import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseFromRouteRequest } from '@/lib/server/supabaseRouteAuth';
import { userMayAccessBusinessInsights } from '@/lib/server/businessInsightsEligibility';

/**
 * Returns whether the signed-in user may access /insights (verified_business or dev allowlist).
 */
export async function GET(request: NextRequest) {
  const { supabase, user, authError } = await getSupabaseFromRouteRequest(request);

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const insightsAllowed = await userMayAccessBusinessInsights(supabase, user);
  return NextResponse.json({ insightsAllowed });
}
