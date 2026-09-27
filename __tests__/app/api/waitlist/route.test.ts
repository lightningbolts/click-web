/** @jest-environment node */
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/waitlist/route';
import { invalidWaitlistEmails, validWaitlistEmails } from '../../../helpers/waitlistEmails';

const mockInsert = jest.fn();
const mockFrom = jest.fn(() => ({ insert: mockInsert }));
const mockCreateAdminClient = jest.fn(() => ({ from: mockFrom }));

jest.mock('@/lib/server/connectionWriteAuth', () => ({
  createAdminClient: () => mockCreateAdminClient(),
}));

function request(body: unknown) {
  return new NextRequest('http://localhost/api/waitlist', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockInsert.mockResolvedValue({ error: null });
});

describe('POST /api/waitlist', () => {
  it.each([...invalidWaitlistEmails, null, undefined, 123, {}, []])(
    'rejects invalid email %p before accessing storage',
    async (email) => {
      const response = await POST(request({ email }));
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ code: 'validation_error' });
      expect(mockCreateAdminClient).not.toHaveBeenCalled();
    },
  );

  it.each(validWaitlistEmails)('accepts valid email %s and inserts it immediately', async (email) => {
    const response = await POST(request({ email }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      success: true,
      message: 'Successfully joined the waitlist!',
    });
    expect(mockFrom).toHaveBeenCalledWith('waitlist');
    expect(mockInsert).toHaveBeenCalledWith({ email });
  });

  it('trims whitespace and preserves source/referral attribution', async () => {
    const response = await POST(request({
      email: '  Ada.Lovelace+click@students.example.co.uk  ',
      source: 'deep_link',
      referrer_user_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    }));

    expect(response.status).toBe(200);
    expect(mockInsert).toHaveBeenCalledWith({
      email: 'Ada.Lovelace+click@students.example.co.uk',
      source: 'deep_link',
      referrer_user_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    });
  });

  it('treats duplicate emails as an idempotent success', async () => {
    mockInsert.mockResolvedValueOnce({ error: { code: '23505', message: 'duplicate key' } });

    const response = await POST(request({ email: 'terajzhang@gmail.com' }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      message: "You're already on the waitlist!",
    });
  });

  it('falls back to email-only insert when attribution columns are unavailable', async () => {
    mockInsert
      .mockResolvedValueOnce({ error: { code: '42703', message: 'column does not exist' } })
      .mockResolvedValueOnce({ error: null });

    const response = await POST(request({
      email: 'terajzhang@gmail.com',
      source: 'deep_link',
      referrer_user_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    }));

    expect(response.status).toBe(200);
    expect(mockInsert).toHaveBeenNthCalledWith(2, { email: 'terajzhang@gmail.com' });
  });

  it('treats a duplicate on the fallback insert as success', async () => {
    mockInsert
      .mockResolvedValueOnce({ error: { code: '42703', message: 'column does not exist' } })
      .mockResolvedValueOnce({ error: { code: '23505', message: 'duplicate key' } });

    const response = await POST(request({ email: 'terajzhang@gmail.com', source: 'homepage_hero' }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      message: "You're already on the waitlist!",
    });
  });

  it('returns a storage error for other insert failures', async () => {
    mockInsert.mockResolvedValueOnce({ error: { code: '42501', message: 'permission denied' } });

    const response = await POST(request({ email: 'terajzhang@gmail.com' }));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: 'waitlist_insert_failed' });
  });

  it('rejects malformed JSON before accessing storage', async () => {
    const response = await POST(new NextRequest('http://localhost/api/waitlist', {
      method: 'POST',
      body: '{',
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: 'invalid_json' });
    expect(mockCreateAdminClient).not.toHaveBeenCalled();
  });
});
