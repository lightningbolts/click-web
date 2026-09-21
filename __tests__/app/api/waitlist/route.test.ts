/** @jest-environment node */
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/waitlist/route';
import { POST as verify } from '@/app/api/waitlist/verify/route';
import { hashVerificationToken } from '@/lib/server/waitlistVerification';
import { invalidWaitlistEmails, validWaitlistEmails } from '../../../helpers/waitlistEmails';

const mockRpc = jest.fn();
const mockFrom = jest.fn();
const mockCreateAdminClient = jest.fn(() => ({ rpc: mockRpc, from: mockFrom }));
const mockLimited = jest.fn();
jest.mock('@/lib/server/connectionWriteAuth', () => ({ createAdminClient: () => mockCreateAdminClient() }));
jest.mock('@/lib/server/rateLimit', () => ({
  isRateLimited: (...args: unknown[]) => mockLimited(...args), CONNECTIONS_RATE_LIMIT_BINDING: 'CONNECTIONS_RATE_LIMITER',
}));
const originalEnv = process.env;
const originalFetch = global.fetch;
const mockMail = jest.fn();

function request(body: unknown) {
  return new NextRequest('http://localhost/api/waitlist', {
    method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env = { ...originalEnv, RESEND_API_KEY: 'test-key', WAITLIST_EMAIL_FROM: 'Click <waitlist@example.com>', WAITLIST_VERIFICATION_BASE_URL: 'https://joinclick.co' };
  mockRpc.mockReset().mockResolvedValue({ data: true, error: null });
  mockMail.mockReset().mockResolvedValue({ ok: true, json: async () => ({ id: 'test-mail' }) });
  mockLimited.mockReset().mockResolvedValue(false);
  global.fetch = mockMail;
});
afterAll(() => { process.env = originalEnv; global.fetch = originalFetch; });

describe('POST /api/waitlist', () => {
  it.each([...invalidWaitlistEmails, null, undefined, 123, {}, []])('rejects %p before accessing storage or email', async (email) => {
    const response = await POST(request({ email }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: 'validation_error' });
    expect(mockCreateAdminClient).not.toHaveBeenCalled();
    expect(mockMail).not.toHaveBeenCalled();
  });

  it.each(validWaitlistEmails)('requires confirmation for %s, never adding it directly to the waitlist', async (email) => {
    const response = await POST(request({ email }));
    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({ success: true, verificationRequired: true });
    expect(mockRpc).toHaveBeenCalledWith('request_waitlist_verification', expect.objectContaining({ p_email: email }));
    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockMail).toHaveBeenCalledTimes(1);
  });

  it('sends the link only to the mailbox and stores only its hash, preserving attribution', async () => {
    const response = await POST(request({ email: '  terajzhang@gmail.com  ', source: 'deep_link', referrer_user_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }));
    const body = await response.json();
    const [url, options] = mockMail.mock.calls[0];
    const mail = JSON.parse(options.body);
    expect(url).toBe('https://api.resend.com/emails');
    expect(mail.to).toEqual(['terajzhang@gmail.com']);
    const token = mail.text.match(/https:\/\/joinclick.co\/waitlist\/verify#token=([a-f0-9]{64})/)[1];
    expect(JSON.stringify(body)).not.toContain(token);
    expect(mockRpc).toHaveBeenCalledWith('request_waitlist_verification', {
      p_email: 'terajzhang@gmail.com', p_token_hash: await hashVerificationToken(token),
      p_source: 'deep_link', p_referrer_user_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    });
    expect(options.headers.Authorization).toBe('Bearer test-key');
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it('does not mark a made-up but formatted address verified', async () => {
    const response = await POST(request({ email: 'made-up-mailbox-49271@example.com' }));
    expect(await response.json()).toMatchObject({ verificationRequired: true });
    expect(mockRpc).not.toHaveBeenCalledWith('confirm_waitlist_email', expect.anything());
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('uses the same pending response for duplicates and cooldown without sending again', async () => {
    const first = await POST(request({ email: 'terajzhang@gmail.com' }));
    mockRpc.mockResolvedValueOnce({ data: false, error: null });
    const second = await POST(request({ email: 'terajzhang@gmail.com' }));
    expect(await second.json()).toEqual(await first.json());
    expect(mockMail).toHaveBeenCalledTimes(1);
  });

  it('rate-limits signup before sending mail', async () => {
    mockLimited.mockResolvedValueOnce(true);
    const response = await POST(request({ email: 'terajzhang@gmail.com' }));
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('60');
    expect(mockMail).not.toHaveBeenCalled();
  });

  it.each(['RESEND_API_KEY', 'WAITLIST_EMAIL_FROM'])('fails closed without %s', async (key) => {
    delete process.env[key];
    expect((await POST(request({ email: 'terajzhang@gmail.com' }))).status).toBe(503);
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockMail).not.toHaveBeenCalled();
  });

  it('fails closed if the migration is missing', async () => {
    mockRpc.mockResolvedValueOnce({ error: { message: 'function missing' } });
    expect((await POST(request({ email: 'terajzhang@gmail.com' }))).status).toBe(503);
    expect(mockMail).not.toHaveBeenCalled();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it.each(['rejected', 'network', 'bad-response'])('does not report success on email %s failure', async (kind) => {
    if (kind === 'network') mockMail.mockRejectedValueOnce(new Error('offline'));
    else mockMail.mockResolvedValueOnce({ ok: kind !== 'rejected', json: async () => ({}) });
    const response = await POST(request({ email: 'terajzhang@gmail.com' }));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: 'service_unavailable' });
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('rejects malformed JSON', async () => {
    const response = await POST(new NextRequest('http://localhost/api/waitlist', { method: 'POST', body: '{' }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: 'invalid_json' });
    expect(mockMail).not.toHaveBeenCalled();
  });
});

describe('POST /api/waitlist/verify', () => {
  it('rate-limits confirmation without consuming a token', async () => {
    mockLimited.mockResolvedValueOnce(true);
    expect((await verify(request({ token: 'a'.repeat(64) }))).status).toBe(429);
    expect(mockRpc).not.toHaveBeenCalled();
  });
  it.each(['', 'made-up-token', 'a'.repeat(63), 'g'.repeat(64), null])('rejects malformed token %p', async (token) => {
    expect((await verify(request({ token }))).status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('confirms only after the database atomically redeems the emailed token', async () => {
    const token = 'a'.repeat(64);
    const response = await verify(request({ token }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, verified: true });
    expect(mockRpc).toHaveBeenCalledWith('confirm_waitlist_email', { p_token_hash: await hashVerificationToken(token) });
    expect(mockMail).not.toHaveBeenCalled();
  });

  it('rejects unknown, expired, and already-consumed tokens', async () => {
    mockRpc.mockResolvedValueOnce({ data: false, error: null });
    const response = await verify(request({ token: 'a'.repeat(64) }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: 'invalid_verification' });
  });

  it('does not claim verification when storage fails', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'unavailable' } });
    expect((await verify(request({ token: 'a'.repeat(64) }))).status).toBe(503);
  });
});
