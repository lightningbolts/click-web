/**
 * @jest-environment node
 */

import { NextRequest } from 'next/server';

const mockGetSupabaseFromRouteRequest = jest.fn();
const mockCreateAdminClient = jest.fn();
const mockAddGrant = jest.fn();
const mockToJwt = jest.fn();

jest.mock('@/lib/server/supabaseRouteAuth', () => ({
  getSupabaseFromRouteRequest: (...args: unknown[]) => mockGetSupabaseFromRouteRequest(...args),
}));

jest.mock('@/lib/server/connectionWriteAuth', () => ({
  createAdminClient: () => mockCreateAdminClient(),
}));

jest.mock('livekit-server-sdk', () => ({
  AccessToken: jest.fn().mockImplementation(() => ({
    addGrant: mockAddGrant,
    toJwt: mockToJwt,
  })),
}));

function postToken(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/livekit/token', {
    method: 'POST',
    headers: {
      authorization: 'Bearer fake.jwt.token',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

describe('POST /api/livekit/token contract', () => {
  const userId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const connectionId = 'conn-livekit-1';
  const groupId = 'group-livekit-1';
  const originalKey = process.env.LIVEKIT_API_KEY;
  const originalSecret = process.env.LIVEKIT_API_SECRET;
  const originalWs = process.env.LIVEKIT_WS_URL;
  const originalUrl = process.env.LIVEKIT_URL;

  beforeEach(() => {
    mockGetSupabaseFromRouteRequest.mockReset();
    mockCreateAdminClient.mockReset();
    mockAddGrant.mockReset();
    mockToJwt.mockReset();
    mockToJwt.mockResolvedValue('minted.livekit.jwt');
    delete process.env.LIVEKIT_API_KEY;
    delete process.env.LIVEKIT_API_SECRET;
    delete process.env.LIVEKIT_WS_URL;
    delete process.env.LIVEKIT_URL;
  });

  afterAll(() => {
    process.env.LIVEKIT_API_KEY = originalKey;
    process.env.LIVEKIT_API_SECRET = originalSecret;
    process.env.LIVEKIT_WS_URL = originalWs;
    process.env.LIVEKIT_URL = originalUrl;
  });

  it('returns 401 Unauthorized before checking LiveKit env', async () => {
    process.env.LIVEKIT_API_KEY = 'key';
    process.env.LIVEKIT_API_SECRET = 'secret';
    process.env.LIVEKIT_WS_URL = 'wss://example.livekit.cloud';
    mockGetSupabaseFromRouteRequest.mockResolvedValue({
      supabase: { from: jest.fn() },
      user: null,
      authError: new Error('no session'),
    });

    const { POST } = await import('@/app/api/livekit/token/route');
    const res = await POST(
      postToken({
        connection_id: connectionId,
        room_name: `click-${connectionId}-x`,
        participant_name: 'probe',
      }),
    );

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' });
    expect(mockCreateAdminClient).not.toHaveBeenCalled();
  });

  it('returns 500 when LiveKit env is missing after auth', async () => {
    mockGetSupabaseFromRouteRequest.mockResolvedValue({
      supabase: { from: jest.fn() },
      user: { id: userId, email: 'probe@example.com' },
      authError: null,
    });

    const { POST } = await import('@/app/api/livekit/token/route');
    const res = await POST(
      postToken({
        connection_id: connectionId,
        room_name: `click-${connectionId}-x`,
        participant_name: 'probe',
      }),
    );

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({
      error: 'LiveKit environment is not configured',
    });
    expect(mockCreateAdminClient).not.toHaveBeenCalled();
  });

  it('returns 400 when room_name is missing', async () => {
    process.env.LIVEKIT_API_KEY = 'key';
    process.env.LIVEKIT_API_SECRET = 'secret';
    process.env.LIVEKIT_WS_URL = 'wss://example.livekit.cloud';
    mockGetSupabaseFromRouteRequest.mockResolvedValue({
      supabase: { from: jest.fn() },
      user: { id: userId, email: 'probe@example.com' },
      authError: null,
    });

    const { POST } = await import('@/app/api/livekit/token/route');
    const res = await POST(
      postToken({
        connection_id: connectionId,
        participant_name: 'probe',
      }),
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'room_name is required' });
    expect(mockCreateAdminClient).not.toHaveBeenCalled();
  });

  it('returns 400 when 1:1 room_name does not match connection_id', async () => {
    process.env.LIVEKIT_API_KEY = 'key';
    process.env.LIVEKIT_API_SECRET = 'secret';
    process.env.LIVEKIT_WS_URL = 'wss://example.livekit.cloud';
    mockGetSupabaseFromRouteRequest.mockResolvedValue({
      supabase: { from: jest.fn() },
      user: { id: userId, email: 'probe@example.com' },
      authError: null,
    });
    mockCreateAdminClient.mockReturnValue({ from: jest.fn() });

    const { POST } = await import('@/app/api/livekit/token/route');
    const res = await POST(
      postToken({
        connection_id: connectionId,
        room_name: 'click-other-id-x',
        participant_name: 'probe',
      }),
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: 'room_name does not match connection_id',
    });
  });

  it('takes the group branch when group_id matches click-group-{id}- room prefix', async () => {
    process.env.LIVEKIT_API_KEY = 'key';
    process.env.LIVEKIT_API_SECRET = 'secret';
    process.env.LIVEKIT_WS_URL = 'wss://example.livekit.cloud';
    mockGetSupabaseFromRouteRequest.mockResolvedValue({
      supabase: { from: jest.fn() },
      user: { id: userId, email: 'probe@example.com' },
      authError: null,
    });

    const membershipMaybeSingle = jest.fn().mockResolvedValue({
      data: { user_id: userId },
      error: null,
    });
    const memberRows = {
      data: [{ user_id: userId }, { user_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }],
      error: null,
    };
    const blockMaybeSingle = jest.fn().mockResolvedValue({ data: null, error: null });
    const from = jest.fn((table: string) => {
      if (table === 'group_members') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({ maybeSingle: membershipMaybeSingle }),
              then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
                Promise.resolve(memberRows).then(resolve, reject),
            }),
          }),
        };
      }
      if (table === 'user_blocks') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                maybeSingle: blockMaybeSingle,
              }),
            }),
          }),
        };
      }
      if (table === 'connections') {
        throw new Error('1:1 connections lookup must not run on the group branch');
      }
      throw new Error(`unexpected table ${table}`);
    });
    mockCreateAdminClient.mockReturnValue({ from });

    const { POST } = await import('@/app/api/livekit/token/route');
    const res = await POST(
      postToken({
        connection_id: groupId,
        group_id: groupId,
        room_name: `click-group-${groupId}-x`,
        participant_name: 'probe',
      }),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      token: 'minted.livekit.jwt',
      ws_url: 'wss://example.livekit.cloud',
    });
    expect(from).toHaveBeenCalledWith('group_members');
    expect(mockAddGrant).toHaveBeenCalledWith({
      room: `click-group-${groupId}-x`,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
    });
  });
});
