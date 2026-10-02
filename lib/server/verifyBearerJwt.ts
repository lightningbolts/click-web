import 'server-only';

import type { User } from '@supabase/supabase-js';
import { createRemoteJWKSet, errors, jwtVerify, type JWTPayload } from 'jose';

/**
 * Local verification of Supabase access tokens (asymmetric signing keys, published JWKS).
 *
 * `supabase.auth.getUser(jwt)` costs a network round trip to Supabase Auth on every API
 * request. Verifying the signature, issuer, audience and expiry locally against the cached JWKS
 * gives the same identity guarantee Supabase recommends for `getClaims()`, without the hop.
 * Tokens this can't verify locally (legacy HS256, unknown `kid`) return `undefined` so the
 * caller falls back to `getUser`. Expired or tampered tokens return `null` (unauthorized).
 *
 * Revocation note: a signed-out or banned user's access token stays valid until it expires
 * (≤ 1 h), exactly as with `getClaims()`. Data access is still RLS-enforced with the same JWT.
 */

type JWKS = ReturnType<typeof createRemoteJWKSet>;
const jwksBySupabaseURL = new Map<string, JWKS>();

function jwksFor(supabaseURL: string): JWKS {
  let jwks = jwksBySupabaseURL.get(supabaseURL);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${supabaseURL}/auth/v1/.well-known/jwks.json`), {
      cacheMaxAge: 10 * 60 * 1000,
      cooldownDuration: 30 * 1000,
    });
    jwksBySupabaseURL.set(supabaseURL, jwks);
  }
  return jwks;
}

/** A `User` built from verified claims (id, email, phone, metadata, role). */
export function userFromClaims(payload: JWTPayload): User | null {
  const claims = payload as JWTPayload & {
    email?: string;
    phone?: string;
    role?: string;
    app_metadata?: Record<string, unknown>;
    user_metadata?: Record<string, unknown>;
    is_anonymous?: boolean;
  };
  if (!claims.sub || claims.role !== 'authenticated') return null;
  return {
    id: claims.sub,
    aud: typeof claims.aud === 'string' ? claims.aud : 'authenticated',
    role: claims.role,
    email: claims.email,
    phone: claims.phone,
    app_metadata: claims.app_metadata ?? {},
    user_metadata: claims.user_metadata ?? {},
    is_anonymous: claims.is_anonymous ?? false,
    created_at: '',
  } as User;
}

/**
 * `User` when verified locally, `null` when the token is definitely invalid (expired, bad
 * signature, wrong issuer/audience), `undefined` when it can't be checked locally.
 */
export async function verifyBearerLocally(supabaseURL: string, token: string): Promise<User | null | undefined> {
  const base = supabaseURL.replace(/\/+$/, '');
  try {
    const { payload } = await jwtVerify(token, jwksFor(base), {
      issuer: `${base}/auth/v1`,
      audience: 'authenticated',
      algorithms: ['ES256', 'RS256'],
    });
    return userFromClaims(payload);
  } catch (error) {
    if (
      error instanceof errors.JWTExpired ||
      error instanceof errors.JWSSignatureVerificationFailed ||
      error instanceof errors.JWTClaimValidationFailed
    ) {
      return null;
    }
    // Legacy HS256 tokens, an unknown `kid`, or a JWKS fetch failure: let Supabase decide.
    return undefined;
  }
}
