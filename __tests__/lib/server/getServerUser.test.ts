/**
 * @jest-environment node
 */

import { hasSupabaseAuthCookie } from '@/lib/server/getServerUser';

describe('hasSupabaseAuthCookie', () => {
  it('is false when the request has no cookies', () => {
    expect(hasSupabaseAuthCookie([])).toBe(false);
  });

  it('ignores PKCE verifier cookies', () => {
    expect(hasSupabaseAuthCookie(['sb-abc-auth-token-code-verifier'])).toBe(false);
  });

  it('detects a session cookie', () => {
    expect(hasSupabaseAuthCookie(['sb-abc-auth-token'])).toBe(true);
  });

  it('detects chunked session cookies', () => {
    expect(hasSupabaseAuthCookie(['sb-abc-auth-token.0', 'sb-abc-auth-token.1'])).toBe(true);
  });
});
