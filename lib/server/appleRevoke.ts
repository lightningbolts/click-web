import 'server-only';

import { importPKCS8, SignJWT } from 'jose';
import { runtimeEnv } from '@/lib/server/runtimeEnv';

/**
 * Sign in with Apple token revocation on account deletion (App Store 5.1.1(v)).
 *
 * The iOS app signs in through Supabase `signInWithIdToken`, so no Apple refresh token is kept.
 * At deletion the app re-runs Sign in with Apple for a fresh authorization code; this exchanges
 * it for a refresh token and revokes that, which also ends the app's link in the user's Apple ID.
 *
 * Never throws: deletion must not be blocked by Apple being down or the key being unset.
 */

const APPLE_AUTH = 'https://appleid.apple.com';
/** Native authorization codes are issued to the app's bundle ID, not a web Services ID. */
const DEFAULT_IOS_CLIENT_ID = 'compose.project.click.click';

export type AppleRevokeResult =
  | 'revoked'
  | 'not_configured'
  | 'exchange_failed'
  | 'revoke_failed';

type AppleSignInConfig = {
  teamId: string;
  keyId: string;
  privateKey: string;
  clientId: string;
};

export function appleSignInConfig(): AppleSignInConfig | null {
  const teamId = runtimeEnv('APPLE_TEAM_ID');
  const keyId = runtimeEnv('APPLE_SIGN_IN_KEY_ID');
  // Worker secrets are single-line; accept the .p8 contents with literal "\n" escapes.
  const privateKey = runtimeEnv('APPLE_SIGN_IN_PRIVATE_KEY')?.replace(/\\n/g, '\n');
  if (!teamId || !keyId || !privateKey) return null;
  return { teamId, keyId, privateKey, clientId: runtimeEnv('APPLE_IOS_CLIENT_ID') ?? DEFAULT_IOS_CLIENT_ID };
}

/** The ES256 client secret Apple's token and revoke endpoints require (valid 5 minutes). */
export async function appleClientSecret(config: AppleSignInConfig, now = Date.now()): Promise<string> {
  const key = await importPKCS8(config.privateKey, 'ES256');
  const iat = Math.floor(now / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: config.keyId })
    .setIssuer(config.teamId)
    .setSubject(config.clientId)
    .setAudience(APPLE_AUTH)
    .setIssuedAt(iat)
    .setExpirationTime(iat + 300)
    .sign(key);
}

export async function revokeAppleAuthorizationCode(
  authorizationCode: string,
  fetchImpl: typeof fetch = fetch,
): Promise<AppleRevokeResult> {
  const config = appleSignInConfig();
  if (!config) return 'not_configured';

  try {
    const clientSecret = await appleClientSecret(config);
    const form = (fields: Record<string, string>) =>
      ({
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: config.clientId, client_secret: clientSecret, ...fields }),
      }) satisfies RequestInit;

    const tokenRes = await fetchImpl(
      `${APPLE_AUTH}/auth/token`,
      form({ grant_type: 'authorization_code', code: authorizationCode }),
    );
    const tokens = (await tokenRes.json().catch(() => ({}))) as { refresh_token?: string; access_token?: string };
    const token = tokens.refresh_token ?? tokens.access_token;
    if (!tokenRes.ok || !token) return 'exchange_failed';

    const revokeRes = await fetchImpl(
      `${APPLE_AUTH}/auth/revoke`,
      form({ token, token_type_hint: tokens.refresh_token ? 'refresh_token' : 'access_token' }),
    );
    return revokeRes.ok ? 'revoked' : 'revoke_failed';
  } catch {
    return 'revoke_failed';
  }
}

/** True when the Supabase user has an Apple identity (`app_metadata.providers`). */
export function isAppleUser(appMetadata: Record<string, unknown> | undefined): boolean {
  const providers = appMetadata?.providers;
  if (Array.isArray(providers)) return providers.includes('apple');
  return appMetadata?.provider === 'apple';
}
