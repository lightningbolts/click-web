import type { SupabaseClient, User } from '@supabase/supabase-js';
import type { NextRequest } from 'next/server';
import { getSupabaseFromRouteRequest } from '@/lib/server/supabaseRouteAuth';

type AuthenticatedSupabaseResult = {
  token: string | null;
  user: User | null;
  supabase: SupabaseClient;
};

/**
 * Authenticate a Route Handler request.
 *
 * Prefers `Authorization: Bearer` (mobile + web fetch), then falls back to the
 * SSR cookie session via `@supabase/ssr`. Never treat the raw SSR cookie blob as a JWT —
 * that was returning 401 for every logged-in web chat/profile call.
 */
export async function getAuthenticatedSupabase(req: NextRequest): Promise<AuthenticatedSupabaseResult> {
  const bearer =
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim() || null;
  const { user, supabase, authError } = await getSupabaseFromRouteRequest(req);
  if (authError || !user) {
    return { token: bearer, user: null, supabase };
  }
  return { token: bearer, user, supabase };
}
