import 'server-only';

import { cache } from 'react';
import { cookies } from 'next/headers';
import { unstable_rethrow } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '@/lib/server/supabaseServer';

import { hasSupabaseAuthCookie } from '@/lib/auth/authCookie';

export { hasSupabaseAuthCookie };

/**
 * One Auth round-trip per request (React `cache`), shared by every server caller.
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
    // Let Next's own signals (dynamic usage during prerender, redirects) through.
    unstable_rethrow(err);
    console.error('Server session check failed:', err);
    return null;
  }
});
