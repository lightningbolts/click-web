import 'server-only';

import { cache } from 'react';
import { cookies } from 'next/headers';
import type { User } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '@/lib/server/supabaseServer';

/**
 * True when the request carries a Supabase SSR session cookie (including
 * chunked `*.0` / `*.1` blobs). PKCE verifier cookies are not a session.
 */
export function hasSupabaseAuthCookie(cookieNames: readonly string[]): boolean {
  return cookieNames.some(
    (name) => name.includes('-auth-token') && !name.includes('code-verifier'),
  );
}

/**
 * One Auth round-trip per request, shared by root layout + `/`.
 * Anonymous visitors with no session cookie skip the network call entirely.
 */
export const getServerUser = cache(async (): Promise<User | null> => {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return null;
  }

  try {
    const store = await cookies();
    if (!hasSupabaseAuthCookie(store.getAll().map((cookie) => cookie.name))) {
      return null;
    }

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user ?? null;
  } catch (err) {
    console.error('Server session check failed:', err);
    return null;
  }
});
