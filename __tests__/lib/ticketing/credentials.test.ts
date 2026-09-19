/**
 * @jest-environment node
 */
import {
  hashTicketToken,
  mintTicketCredential,
  mintTicketNumber,
  ticketQrUrl,
} from '@/lib/server/ticketing/credentials';

describe('mintTicketCredential', () => {
  it('produces a high-entropy token whose hash round-trips', () => {
    const { token, tokenHash } = mintTicketCredential();
    // 32 bytes base64url ≈ 43 chars, no padding, URL-safe.
    expect(token.length).toBeGreaterThanOrEqual(42);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashTicketToken(token)).toBe(tokenHash);
  });

  it('never repeats tokens', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) seen.add(mintTicketCredential().token);
    expect(seen.size).toBe(200);
  });
});

describe('mintTicketNumber', () => {
  it('is human-safe and carries no sequence or PII', () => {
    const n = mintTicketNumber();
    expect(n).toMatch(/^CLK-[A-Z2-9]{5}-[A-Z2-9]{5}$/);
    expect(n).not.toMatch(/[0O1I]/);
  });
});

describe('ticketQrUrl', () => {
  it('builds the https payload and tolerates trailing slashes', () => {
    expect(ticketQrUrl('https://joinclick.co/', 'abc')).toBe('https://joinclick.co/t/abc');
    expect(ticketQrUrl('https://joinclick.co', 'abc')).toBe('https://joinclick.co/t/abc');
  });
});
