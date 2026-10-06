/**
 * True when the request carries a Supabase SSR session cookie (including
 * chunked `*.0` / `*.1` blobs). PKCE verifier cookies are not a session.
 * Edge-safe: used by `proxy.ts` and `getServerUser`.
 */
export function hasSupabaseAuthCookie(cookieNames: readonly string[]): boolean {
  return cookieNames.some(
    (name) => name.includes('-auth-token') && !name.includes('code-verifier'),
  );
}
