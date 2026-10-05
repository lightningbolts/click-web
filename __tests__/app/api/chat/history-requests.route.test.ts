/** @jest-environment node */

import { NextRequest } from 'next/server';

const mockRequireBearerUser = jest.fn();
const mockCreateAdmin = jest.fn();

jest.mock('server-only', () => ({}));
jest.mock('@/lib/server/chatGatekeeper', () => ({
  requireBearerUser: (...args: unknown[]) => mockRequireBearerUser(...args),
  createChatGatekeeperAdmin: (...args: unknown[]) => mockCreateAdmin(...args),
}));

import { POST } from '@/app/api/chat/devices/history-requests/[requestId]/route';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const REQUEST_ID = '33333333-3333-4333-8333-333333333333';

function jwt(amr: unknown): string {
  const b64 = (value: unknown) => Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
  return `${b64({ alg: 'ES256' })}.${b64({ sub: USER_ID, amr })}.sig`;
}

function pendingRow(overrides: Record<string, unknown> = {}) {
  return {
    id: REQUEST_ID,
    user_id: USER_ID,
    status: 'pending',
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 3_600_000).toISOString(),
    decided_at: null,
    device: { created_at: new Date().toISOString(), revoked_at: null },
    ...overrides,
  };
}

function adminWith(row: Record<string, unknown> | null) {
  const update = jest.fn(() => {
    const chain = {
      eq: () => chain,
      select: () => chain,
      maybeSingle: async () => ({ data: { ...row, status: 'approved', decided_at: new Date().toISOString() }, error: null }),
    };
    return chain;
  });
  const selectChain = {
    eq: () => selectChain,
    maybeSingle: async () => ({ data: row, error: null }),
  };
  const select = jest.fn((_columns: string) => selectChain);
  return {
    admin: { from: jest.fn(() => ({ select, update })) },
    update,
    select,
  };
}

function post(decision: string) {
  return POST(
    new NextRequest(`https://click.example/api/chat/devices/history-requests/${REQUEST_ID}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ decision }),
    }),
    { params: Promise.resolve({ requestId: REQUEST_ID }) },
  );
}

describe('/api/chat/devices/history-requests/[requestId]', () => {
  beforeEach(() => {
    mockRequireBearerUser.mockReset();
    mockCreateAdmin.mockReset();
  });

  it('refuses a password session: approval needs the emailed link', async () => {
    const now = Math.floor(Date.now() / 1000);
    mockRequireBearerUser.mockResolvedValue({ ok: true, user: { id: USER_ID }, bearer: jwt([{ method: 'password', timestamp: now }]) });
    const response = await post('approve');
    expect(response.status).toBe(403);
    expect(mockCreateAdmin).not.toHaveBeenCalled();
  });

  it('approves a pending request from a fresh magic-link session', async () => {
    const now = Math.floor(Date.now() / 1000);
    mockRequireBearerUser.mockResolvedValue({ ok: true, user: { id: USER_ID }, bearer: jwt([{ method: 'otp', timestamp: now }]) });
    const { admin, update } = adminWith(pendingRow());
    mockCreateAdmin.mockReturnValue(admin);
    const response = await post('approve');
    expect(response.status).toBe(200);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ status: 'approved' }));
  });

  it("does not reveal or decide another user's request", async () => {
    const now = Math.floor(Date.now() / 1000);
    mockRequireBearerUser.mockResolvedValue({ ok: true, user: { id: USER_ID }, bearer: jwt([{ method: 'otp', timestamp: now }]) });
    const { admin, update } = adminWith(pendingRow({ user_id: 'someone-else' }));
    mockCreateAdmin.mockReturnValue(admin);
    const response = await post('approve');
    expect(response.status).toBe(404);
    expect(update).not.toHaveBeenCalled();
  });

  it('rejects expired requests', async () => {
    const now = Math.floor(Date.now() / 1000);
    mockRequireBearerUser.mockResolvedValue({ ok: true, user: { id: USER_ID }, bearer: jwt([{ method: 'otp', timestamp: now }]) });
    const { admin, update } = adminWith(pendingRow({ expires_at: new Date(Date.now() - 1000).toISOString() }));
    mockCreateAdmin.mockReturnValue(admin);
    const response = await post('approve');
    expect(response.status).toBe(410);
    expect(update).not.toHaveBeenCalled();
  });

  it('embeds the requesting device by recipient_device_id (two FKs point at chat_devices)', async () => {
    mockRequireBearerUser.mockResolvedValue({ ok: true, user: { id: USER_ID }, bearer: jwt([{ method: 'otp', timestamp: Math.floor(Date.now() / 1000) }]) });
    const { admin, select } = adminWith(pendingRow());
    mockCreateAdmin.mockReturnValue(admin);
    await post('approve');
    expect(select).toHaveBeenCalled();
    for (const [columns] of select.mock.calls) {
      if (columns.includes('chat_devices')) expect(columns).toContain('chat_devices!recipient_device_id(');
    }
  });
});
