import 'server-only';

import { cache } from 'react';
import { cookies } from 'next/headers';
import { unstable_rethrow } from 'next/navigation';
import type { JwtPayload, User } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '@/lib/server/supabaseServer';

import { hasSupabaseAuthCookie } from '@/lib/auth/authCookie';

export { hasSupabaseAuthCookie };

/** The session's verified JWT claims as a `User`. Fields the token doesn't carry stay empty. */
function userFromClaims(claims: JwtPayload): User {
  return {
    id: claims.sub,
    aud: typeof claims.aud === 'string' ? claims.aud : 'authenticated',
    role: claims.role,
    email: claims.email,
    phone: claims.phone,
    is_anonymous: claims.is_anonymous,
    app_metadata: claims.app_metadata ?? {},
    user_metadata: claims.user_metadata ?? {},
    created_at: '',
  };
}

/**
 * One session check per request (React `cache`), shared by every server caller. `getClaims()`
 * verifies the access token locally against the cached project JWKS, like middleware (spec
 * §11.4), so signed-in pages don't wait on an Auth round-trip. Anonymous visitors with no
 * session cookie skip it entirely.
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
    const { data } = await supabase.auth.getClaims();
    return data?.claims?.sub ? userFromClaims(data.claims) : null;
  } catch (err) {
    // Let Next's own signals (dynamic usage during prerender, redirects) through.
    unstable_rethrow(err);
    console.error('Server session check failed:', err);
    return null;
  }
});
