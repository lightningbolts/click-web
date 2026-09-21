/** @jest-environment node */
import { hashVerificationToken, newVerificationToken, verificationEmailConfig } from '@/lib/server/waitlistVerification';

const originalEnv = process.env;
beforeEach(() => {
  process.env = { ...originalEnv, RESEND_API_KEY: 'test-key', WAITLIST_EMAIL_FROM: 'Click <waitlist@example.com>', WAITLIST_VERIFICATION_BASE_URL: 'https://joinclick.co' };
});
afterAll(() => { process.env = originalEnv; });

it('generates distinct 256-bit tokens and hashes them with SHA-256', async () => {
  const tokens = Array.from({ length: 100 }, newVerificationToken);
  expect(new Set(tokens).size).toBe(100);
  expect(tokens.every((token) => /^[a-f0-9]{64}$/.test(token))).toBe(true);
  expect(await hashVerificationToken('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

it.each(['http://example.com', 'javascript:alert(1)', 'https://user:password@example.com', 'not-a-url'])('rejects unsafe origin %s', (url) => {
  process.env.WAITLIST_VERIFICATION_BASE_URL = url;
  expect(() => verificationEmailConfig()).toThrow();
});

it('uses only the configured origin, not its path or query', () => {
  process.env.WAITLIST_VERIFICATION_BASE_URL = 'https://joinclick.co/path?redirect=example.com';
  expect(verificationEmailConfig().origin).toBe('https://joinclick.co');
});

it('allows localhost HTTP for development', () => {
  process.env.WAITLIST_VERIFICATION_BASE_URL = 'http://localhost:3000';
  expect(verificationEmailConfig().origin).toBe('http://localhost:3000');
});
