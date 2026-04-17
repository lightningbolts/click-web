/**
 * Shared OAuth helpers for the Next.js auth surface (B4).
 *
 * The mobile (KMP) clients use a separate native-first code path via Supabase's
 * `signInWith(IDToken)`; on the web we always use the hosted redirect flow so we
 * don't have to ship OAuth provider SDKs in the browser bundle.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export type OAuthProvider = 'google' | 'apple';

export interface StartOAuthInput {
  provider: OAuthProvider;
  origin: string;
  /** Path within the app the user should land on after the OAuth round-trip. */
  next?: string;
}

/**
 * Build the provider-aware scope list the Supabase GoTrue flow should request. We keep this
 * conservative so consent screens read cleanly — we only need email + display name for both
 * providers today. If Apple requires explicit `name email`, Google needs `openid profile email`.
 */
export function scopesForProvider(provider: OAuthProvider): string {
  switch (provider) {
    case 'google':
      return 'openid profile email';
    case 'apple':
      return 'name email';
  }
}

/**
 * Build the server-side callback URL (`/api/auth/callback`) that completes the PKCE exchange.
 */
export function buildRedirectUrl(origin: string, next: string = '/dashboard'): string {
  return `${origin}/api/auth/callback?next=${encodeURIComponent(next)}`;
}

/**
 * Kick off the OAuth flow. Resolves once Supabase has issued the provider redirect; the browser
 * is then navigated by the Supabase JS client. Returns the provider URL in case the caller wants
 * to handle the redirect manually (e.g. open in a new tab for debugging).
 */
export async function startOAuth(
  supabase: SupabaseClient,
  input: StartOAuthInput,
): Promise<{ url: string | null; error: string | null }> {
  const { provider, origin, next } = input;
  const redirectTo = buildRedirectUrl(origin, next);
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo,
      scopes: scopesForProvider(provider),
    },
  });
  if (error) return { url: null, error: error.message };
  return { url: data?.url ?? null, error: null };
}
