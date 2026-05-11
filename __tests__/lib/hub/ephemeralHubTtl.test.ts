import { computeEphemeralHubExpiry } from '@/lib/hub/ephemeralHubTtl';

describe('ephemeral hub TTL (server)', () => {
  it('computes expires_at exactly 24 hours after the reference instant', () => {
    const t0 = 1_700_000_000_000;
    const { expires_at_ms, ttl_ms, expires_at_iso } = computeEphemeralHubExpiry(t0);
    expect(ttl_ms).toBe(24 * 60 * 60 * 1000);
    expect(expires_at_ms).toBe(t0 + ttl_ms);
    expect(Date.parse(expires_at_iso)).toBe(expires_at_ms);
  });
});
