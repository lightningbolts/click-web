import 'server-only';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import type { NextRequest, NextResponse } from 'next/server';
import { apiError } from '@/lib/api/errors';
import { placesConfigFrom, type PlacesConfig } from '@/lib/places/config';
import { createAdminSupabaseClient } from '@/lib/server/admin/supabaseAdmin';
import { requireFeature } from '@/lib/server/featureFlags';
import { isRateLimited } from '@/lib/server/rateLimit';
import { getSupabaseFromRouteRequest } from '@/lib/server/supabaseRouteAuth';

export type PlacesUserContext = {
  user: User;
  /** The caller's own client (RLS), e.g. for business-insights eligibility. */
  supabase: SupabaseClient;
  admin: SupabaseClient;
  config: PlacesConfig;
};

/**
 * Auth + `click_places` flag for consumer Places routes (§5.0): 401 without a user, then 404
 * `{ error: 'Not found' }` unless the flag is on for this caller.
 */
export async function requirePlacesUser(
  request: NextRequest,
  options: { requireFlag?: boolean } = {},
): Promise<({ ok: true } & PlacesUserContext) | { ok: false; response: NextResponse }> {
  const { supabase, user, authError } = await getSupabaseFromRouteRequest(request);
  if (authError || !user) return { ok: false, response: apiError('Unauthorized', 401) };
  const admin = createAdminSupabaseClient();
  if (options.requireFlag === false) return { ok: true, user, supabase, admin, config: placesConfigFrom({}) };
  const gate = await requireFeature(admin, 'click_places', user.id);
  if (!gate.ok) return { ok: false, response: gate.response };
  return { ok: true, user, supabase, admin, config: placesConfigFrom(gate.config) };
}

/** §5.0 budgets. Bindings come from wrangler; the in-memory fallback applies `limit` per minute. */
const BUDGETS = {
  check_in: { bindingName: 'CONNECTIONS_RATE_LIMITER', limit: 10 },
  pulse: { bindingName: 'FEATURE_MUTATION_RATE_LIMITER', limit: 20 },
  nearby: { bindingName: 'READ_HEAVY_RATE_LIMITER', limit: 60 },
} as const;

export async function placesRateLimitResponse(kind: keyof typeof BUDGETS, userId: string): Promise<NextResponse | null> {
  const budget = BUDGETS[kind];
  const limited = await isRateLimited({
    bindingName: budget.bindingName,
    key: `places-${kind}:${userId}`,
    limit: budget.limit,
    windowMs: 60_000,
  });
  return limited ? apiError('Too many requests. Please wait a moment and try again.', 429, 'rate_limited') : null;
}

export function placeNotFound(): NextResponse {
  return apiError('Place not found', 404, 'place_not_found');
}
