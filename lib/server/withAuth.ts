import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { getSupabaseFromRouteRequest } from '@/lib/server/supabaseRouteAuth';
import { apiError } from '@/lib/api/errors';

export type AuthedRouteContext = {
  user: User;
  supabase: SupabaseClient;
};

export type WithAuthOk = { ok: true } & AuthedRouteContext;
export type WithAuthFail = { ok: false; response: NextResponse };

/**
 * Require an authenticated Supabase user for a Route Handler.
 * Prefer this over ad-hoc `getUser()` checks so missing auth is consistent.
 */
export async function requireUser(request: NextRequest): Promise<WithAuthOk | WithAuthFail> {
  const { supabase, user, authError } = await getSupabaseFromRouteRequest(request);
  if (authError || !user) {
    return { ok: false, response: apiError('Unauthorized', 401, 'unauthorized') };
  }
  return { ok: true, user, supabase };
}

/**
 * Marker export for public API routes that intentionally skip session auth.
 * Contract tests look for this symbol (or other allowlisted patterns).
 */
export const publicRoute = true as const;
