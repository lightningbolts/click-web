/**
 * @jest-environment node
 */

import { decodeProtectedHeader, decodeJwt, exportPKCS8, generateKeyPair } from 'jose';
import { isAppleUser, revokeAppleAuthorizationCode } from '@/lib/server/appleRevoke';

const ENV_KEYS = ['APPLE_TEAM_ID', 'APPLE_SIGN_IN_KEY_ID', 'APPLE_SIGN_IN_PRIVATE_KEY', 'APPLE_IOS_CLIENT_ID'];

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('revokeAppleAuthorizationCode', () => {
  const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  let pkcs8: string;

  beforeAll(async () => {
    const { privateKey } = await generateKeyPair('ES256', { extractable: true });
    pkcs8 = await exportPKCS8(privateKey);
  });

  beforeEach(() => {
    process.env.APPLE_TEAM_ID = 'TEAM123456';
    process.env.APPLE_SIGN_IN_KEY_ID = 'KEY1234567';
    // Stored as a one-line Worker secret with literal \n escapes.
    process.env.APPLE_SIGN_IN_PRIVATE_KEY = pkcs8.replace(/\n/g, '\\n');
    delete process.env.APPLE_IOS_CLIENT_ID;
  });

  afterAll(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it('exchanges the code, then revokes the refresh token with a signed client secret', async () => {
    const calls: { url: string; body: URLSearchParams }[] = [];
    const fetchImpl = jest.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), body: init?.body as URLSearchParams });
      return String(url).endsWith('/auth/token') ? json(200, { refresh_token: 'r-token', access_token: 'a' }) : json(200, {});
    }) as unknown as typeof fetch;

    await expect(revokeAppleAuthorizationCode('code-1', fetchImpl)).resolves.toBe('revoked');

    expect(calls.map((c) => c.url)).toEqual(['https://appleid.apple.com/auth/token', 'https://appleid.apple.com/auth/revoke']);
    expect(calls[0].body.get('grant_type')).toBe('authorization_code');
    expect(calls[0].body.get('code')).toBe('code-1');
    expect(calls[0].body.get('client_id')).toBe('compose.project.click.click');
    expect(calls[1].body.get('token')).toBe('r-token');
    expect(calls[1].body.get('token_type_hint')).toBe('refresh_token');

    const secret = calls[1].body.get('client_secret')!;
    expect(decodeProtectedHeader(secret)).toMatchObject({ alg: 'ES256', kid: 'KEY1234567' });
    expect(decodeJwt(secret)).toMatchObject({
      iss: 'TEAM123456',
      sub: 'compose.project.click.click',
      aud: 'https://appleid.apple.com',
    });
  });

  it('skips Apple entirely when the key is not configured', async () => {
    delete process.env.APPLE_SIGN_IN_PRIVATE_KEY;
    const fetchImpl = jest.fn() as unknown as typeof fetch;
    await expect(revokeAppleAuthorizationCode('code-1', fetchImpl)).resolves.toBe('not_configured');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('reports a rejected code without revoking', async () => {
    const fetchImpl = jest.fn(async () => json(400, { error: 'invalid_grant' })) as unknown as typeof fetch;
    await expect(revokeAppleAuthorizationCode('used-code', fetchImpl)).resolves.toBe('exchange_failed');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('never throws when Apple is unreachable', async () => {
    const fetchImpl = jest.fn(async () => {
      throw new TypeError('network down');
    }) as unknown as typeof fetch;
    await expect(revokeAppleAuthorizationCode('code-1', fetchImpl)).resolves.toBe('revoke_failed');
  });
});

describe('isAppleUser', () => {
  it('reads the providers list, falling back to the primary provider', () => {
    expect(isAppleUser({ providers: ['email', 'apple'] })).toBe(true);
    expect(isAppleUser({ providers: ['google'] })).toBe(false);
    expect(isAppleUser({ provider: 'apple' })).toBe(true);
    expect(isAppleUser(undefined)).toBe(false);
  });
});
