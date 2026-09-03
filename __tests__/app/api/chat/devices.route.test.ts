/** @jest-environment node */

import { NextRequest, NextResponse } from 'next/server';
import { DELETE, GET, POST } from '@/app/api/chat/devices/route';

const mockRequireBearerUser = jest.fn();
const mockCreateAdmin = jest.fn();
const mockAssertChatWritable = jest.fn();

jest.mock('@/lib/server/chatGatekeeper', () => ({
  requireBearerUser: (...args: unknown[]) => mockRequireBearerUser(...args),
  createChatGatekeeperAdmin: (...args: unknown[]) => mockCreateAdmin(...args),
  assertChatWritable: (...args: unknown[]) => mockAssertChatWritable(...args),
}));

const USER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_USER_ID = '22222222-2222-4222-8222-222222222222';
const UNRELATED_USER_ID = '33333333-3333-4333-8333-333333333333';
const CHAT_ID = '44444444-4444-4444-8444-444444444444';
const DEVICE_ID = 'ios-device-1';
const PUBLIC_KEY = 'MCowBQYDK2VuAyEABwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=';

function authenticated() {
  mockRequireBearerUser.mockResolvedValue({ ok: true, user: { id: USER_ID }, bearer: 'jwt' });
}

function unauthenticated() {
  mockRequireBearerUser.mockResolvedValue({
    ok: false,
    response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
  });
}

function request(url: string, init?: ConstructorParameters<typeof NextRequest>[1]) {
  return new NextRequest(`https://click.example${url}`, init);
}

describe('/api/chat/devices', () => {
  beforeEach(() => {
    mockRequireBearerUser.mockReset();
    mockCreateAdmin.mockReset();
    mockAssertChatWritable.mockReset();
    mockAssertChatWritable.mockResolvedValue(null);
  });

  it.each([
    ['POST', () => POST(request('/api/chat/devices', { method: 'POST' }))],
    ['GET', () => GET(request(`/api/chat/devices?chat_id=${CHAT_ID}`))],
    ['DELETE', () => DELETE(request(`/api/chat/devices?device_id=${DEVICE_ID}`))],
  ])('rejects unauthenticated %s requests', async (_method, invoke) => {
    unauthenticated();

    const response = await invoke();

    expect(response.status).toBe(401);
    expect(mockCreateAdmin).not.toHaveBeenCalled();
  });

  it('rejects malformed registration without writing key material', async () => {
    authenticated();
    const from = jest.fn();
    mockCreateAdmin.mockReturnValue({ from });

    const response = await POST(
      request('/api/chat/devices', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ device_id: ' bad id ', identity_public_key: `${PUBLIC_KEY}\n` }),
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Invalid device registration' });
    expect(from).not.toHaveBeenCalled();
  });

  it('registers only the caller-owned v2 device and projects public fields', async () => {
    authenticated();
    const insert = jest.fn(() => ({
      select: jest.fn(() => ({
        single: jest.fn().mockResolvedValue({
          data: {
            id: 'device-row-1',
            device_id: DEVICE_ID,
            identity_public_key: PUBLIC_KEY,
            key_algorithm: 'X25519',
            crypto_version: 2,
            created_at: '2026-09-03T10:00:00.000Z',
            last_seen_at: '2026-09-03T10:01:00.000Z',
            revoked_at: null,
            private_key: 'must-not-return',
          },
          error: null,
        }),
      })),
    }));
    mockCreateAdmin.mockReturnValue({ from: jest.fn(() => ({ insert })) });

    const response = await POST(
      request('/api/chat/devices', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ device_id: DEVICE_ID, identity_public_key: PUBLIC_KEY }),
      }),
    );

    expect(response.status).toBe(200);
    expect(insert).toHaveBeenCalledWith({
      user_id: USER_ID,
      device_id: DEVICE_ID,
      identity_public_key: PUBLIC_KEY,
      key_algorithm: 'X25519',
      crypto_version: 2,
      last_seen_at: expect.any(String),
    });
    expect(await response.json()).toEqual({
      device: {
        id: 'device-row-1',
        device_id: DEVICE_ID,
        identity_public_key: PUBLIC_KEY,
        key_algorithm: 'X25519',
        crypto_version: 2,
        created_at: '2026-09-03T10:00:00.000Z',
        last_seen_at: '2026-09-03T10:01:00.000Z',
      },
    });
  });

  it('returns conflict instead of reactivating or replacing a revoked device', async () => {
    authenticated();
    const single = jest.fn().mockResolvedValue({
      data: null,
      error: { code: '23505', message: 'duplicate key value violates unique constraint' },
    });
    const insert = jest.fn(() => ({
      select: jest.fn(() => ({ single })),
    }));
    const update = jest.fn();
    const upsert = jest.fn();
    mockCreateAdmin.mockReturnValue({ from: jest.fn(() => ({ insert, update, upsert })) });

    const response = await POST(
      request('/api/chat/devices', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ device_id: DEVICE_ID, identity_public_key: PUBLIC_KEY }),
      }),
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'Device already registered' });
    expect(insert).toHaveBeenCalledWith(expect.not.objectContaining({ revoked_at: expect.anything() }));
    expect(update).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });

  it('authorizes GET before discovering chat-scoped active devices and projects public fields', async () => {
    authenticated();
    const from = jest.fn((table: string) => {
      if (table === 'chats') {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              maybeSingle: jest.fn().mockResolvedValue({
                data: { connection_id: null, group_id: 'group-1' },
                error: null,
              }),
            })),
          })),
        };
      }
      if (table === 'group_members') {
        return {
          select: jest.fn(() => ({
            eq: jest.fn().mockResolvedValue({
              data: [{ user_id: USER_ID }, { user_id: OTHER_USER_ID }],
              error: null,
            }),
          })),
        };
      }
      if (table === 'chat_devices') {
        const activeRows = [
          {
            id: 'device-row-1',
            user_id: USER_ID,
            device_id: DEVICE_ID,
            identity_public_key: PUBLIC_KEY,
            key_algorithm: 'X25519',
            crypto_version: 2,
            created_at: '2026-09-03T10:00:00.000Z',
            last_seen_at: '2026-09-03T10:01:00.000Z',
            revoked_at: null,
            private_key: 'must-not-return',
          },
          {
            id: 'unrelated-device',
            user_id: UNRELATED_USER_ID,
            device_id: 'unrelated',
            identity_public_key: PUBLIC_KEY,
            key_algorithm: 'X25519',
            crypto_version: 2,
            created_at: '2026-09-03T10:00:00.000Z',
            last_seen_at: '2026-09-03T10:01:00.000Z',
            revoked_at: null,
          },
        ];
        return {
          select: jest.fn(() => {
            let participantIds: string[] = [];
            const chain = {} as {
              in: jest.Mock;
              eq: jest.Mock;
              is: jest.Mock;
              order: jest.Mock;
            };
            chain.in = jest.fn((_column: string, ids: string[]) => {
              participantIds = ids;
              return chain;
            });
            chain.eq = jest.fn(() => chain);
            chain.is = jest.fn(() => chain);
            chain.order = jest.fn(async () => ({
              data: activeRows.filter((row) => participantIds.includes(row.user_id)),
              error: null,
            }));
            return chain;
          }),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    });
    mockCreateAdmin.mockReturnValue({ from });

    const response = await GET(request(`/api/chat/devices?chatId=${CHAT_ID}`));

    expect(response.status).toBe(200);
    expect(mockAssertChatWritable).toHaveBeenCalledWith(expect.anything(), USER_ID, CHAT_ID);
    expect(from).toHaveBeenCalledWith('chat_devices');
    expect(await response.json()).toEqual({
      devices: [
        {
          id: 'device-row-1',
          user_id: USER_ID,
          device_id: DEVICE_ID,
          identity_public_key: PUBLIC_KEY,
          key_algorithm: 'X25519',
          crypto_version: 2,
          created_at: '2026-09-03T10:00:00.000Z',
          last_seen_at: '2026-09-03T10:01:00.000Z',
        },
      ],
    });
  });

  it('returns the gatekeeper denial without discovering devices', async () => {
    authenticated();
    const denied = NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    mockAssertChatWritable.mockResolvedValue(denied);
    const from = jest.fn();
    mockCreateAdmin.mockReturnValue({ from });

    const response = await GET(request(`/api/chat/devices?chat_id=${CHAT_ID}`));

    expect(response.status).toBe(403);
    expect(from).not.toHaveBeenCalled();
  });

  it('revokes only the caller-owned active device and preserves the row', async () => {
    authenticated();
    const userFilter = jest.fn();
    const deviceFilter = jest.fn();
    const activeFilter = jest.fn().mockResolvedValue({ error: null });
    userFilter.mockReturnValue({ eq: deviceFilter });
    deviceFilter.mockReturnValue({ is: activeFilter });
    const update = jest.fn(() => ({ eq: userFilter }));
    const from = jest.fn(() => ({ update }));
    mockCreateAdmin.mockReturnValue({ from });

    const response = await DELETE(request(`/api/chat/devices?deviceId=${DEVICE_ID}`));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(from).toHaveBeenCalledWith('chat_devices');
    expect(update).toHaveBeenCalledWith({ revoked_at: expect.any(String) });
    expect(userFilter).toHaveBeenCalledWith('user_id', USER_ID);
    expect(deviceFilter).toHaveBeenCalledWith('device_id', DEVICE_ID);
    expect(activeFilter).toHaveBeenCalledWith('revoked_at', null);
  });
});
