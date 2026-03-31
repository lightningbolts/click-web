import { createServerClient } from '@supabase/ssr';
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';

type RouteAuthResult = {
  supabase: SupabaseClient;
  user: User | null;
  authError: Error | null;
};

/**
 * Supabase auth for Route Handlers: prefers `Authorization: Bearer` from the
 * browser client (implicit flow stores the session in localStorage, not cookies).
 * Falls back to SSR cookie jar when no bearer token is sent.
 */
export async function getSupabaseFromRouteRequest(
  request: NextRequest,
): Promise<RouteAuthResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const bearer =
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim() || null;

  if (bearer) {
    const supabase = createClient(url, anonKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${bearer}` } },
    });
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(bearer);
    return {
      supabase,
      user: user ?? null,
      authError: error as Error | null,
    };
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            (cookieStore as unknown as { set: (n: string, v: string, o: object) => void }).set(
              name,
              value,
              options,
            ),
          );
        } catch {
          /* cookies() may be read-only in some contexts */
        }
      },
    },
  });

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  return {
    supabase,
    user: user ?? null,
    authError: error as Error | null,
  };
}
