/**
 * @jest-environment node
 */
import { SignJWT, exportJWK, generateKeyPair, createLocalJWKSet, type KeyLike } from 'jose';

jest.mock('server-only', () => ({}));

let localSet: ReturnType<typeof createLocalJWKSet>;
jest.mock('jose', () => {
  const actual = jest.requireActual('jose');
  return { ...actual, createRemoteJWKSet: () => (...args: unknown[]) => (localSet as unknown as (...a: unknown[]) => unknown)(...args) };
});

import { verifyBearerLocally } from '@/lib/server/verifyBearerJwt';

const BASE = 'https://proj.supabase.co';

async function setup() {
  const { publicKey, privateKey } = await generateKeyPair('ES256');
  const jwk = { ...(await exportJWK(publicKey)), kid: 'k1', alg: 'ES256' };
  localSet = createLocalJWKSet({ keys: [jwk] });
  return privateKey;
}

function token(key: KeyLike, claims: Record<string, unknown>, exp = '1h', kid = 'k1') {
  return new SignJWT({ role: 'authenticated', email: 'a@b.co', ...claims })
    .setProtectedHeader({ alg: 'ES256', kid })
    .setSubject('user-1')
    .setIssuer(`${BASE}/auth/v1`)
    .setAudience('authenticated')
    .setIssuedAt()
    .setExpirationTime(exp)
    .sign(key);
}

describe('verifyBearerLocally', () => {
  it('returns the user for a valid token without a network call', async () => {
    const key = await setup();
    const user = await verifyBearerLocally(BASE, await token(key, {}));
    expect(user?.id).toBe('user-1');
    expect(user?.email).toBe('a@b.co');
  });

  it('rejects expired tokens', async () => {
    const key = await setup();
    expect(await verifyBearerLocally(BASE, await token(key, {}, '-1m'))).toBeNull();
  });

  it('rejects a token signed by another key', async () => {
    await setup();
    const { privateKey: other } = await generateKeyPair('ES256');
    expect(await verifyBearerLocally(BASE, await token(other, {}))).toBeNull();
  });

  it('defers to Supabase for tokens it cannot check (unknown kid)', async () => {
    const key = await setup();
    expect(await verifyBearerLocally(BASE, await token(key, {}, '1h', 'unknown'))).toBeUndefined();
  });

  it('rejects non-authenticated roles', async () => {
    const key = await setup();
    expect(await verifyBearerLocally(BASE, await token(key, { role: 'anon' }))).toBeNull();
  });
});
