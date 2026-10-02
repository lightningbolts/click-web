import 'server-only';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import type { NextRequest, NextResponse } from 'next/server';
import { apiError } from '@/lib/api/errors';
import { placesConfigFrom, type PlacesConfig } from '@/lib/places/config';
import type { PlaceManagerRole } from '@/lib/places/types';
import { createAdminSupabaseClient } from '@/lib/server/admin/supabaseAdmin';
import { requireFeature } from '@/lib/server/featureFlags';
import { isPlaceManager, loadPlaceByIdOrSlug, type PlaceRow } from '@/lib/server/places/loadPlace';
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

/**
 * Manager routes (§5.7–5.9): signed in + a `place_managers` row for this Place. Not gated by the
 * user feature flag, so owners can prepare before consumer launch. 403 `not_a_manager` otherwise
 * (also for unknown Places, so ids can't be probed).
 */
export async function requirePlaceManagerContext(
  request: NextRequest,
  placeIdOrSlug: string,
  options: { roles?: PlaceManagerRole[] } = {},
): Promise<({ ok: true; place: PlaceRow; role: PlaceManagerRole } & PlacesUserContext) | { ok: false; response: NextResponse }> {
  const ctx = await requirePlacesUser(request, { requireFlag: false });
  if (!ctx.ok) return ctx;
  const place = await loadPlaceByIdOrSlug(ctx.admin, placeIdOrSlug);
  const role = place ? await isPlaceManager(ctx.admin, place.id, ctx.user.id) : null;
  if (!place || !role) return { ok: false, response: apiError('You do not manage this Place', 403, 'not_a_manager') };
  if (options.roles && !options.roles.includes(role)) {
    return { ok: false, response: apiError('Your role cannot change this Place', 403, 'insufficient_role') };
  }
  return { ...ctx, place, role };
}
