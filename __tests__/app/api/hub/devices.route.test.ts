/** @jest-environment node */

import { NextRequest, NextResponse } from 'next/server';
import { GET } from '@/app/api/hub/devices/route';

const mockRequireBearerUser = jest.fn();
const mockCreateAdmin = jest.fn();
const mockAssertHubReadable = jest.fn();

jest.mock('@/lib/server/chatGatekeeper', () => ({
  requireBearerUser: (...args: unknown[]) => mockRequireBearerUser(...args),
  createChatGatekeeperAdmin: (...args: unknown[]) => mockCreateAdmin(...args),
}));

jest.mock('@/lib/server/hubGatekeeper', () => ({
  assertHubReadable: (...args: unknown[]) => mockAssertHubReadable(...args),
}));

const HUB_ID = 'hub-123';
const USER_ID = '11111111-1111-4111-8111-111111111111';

function request(url: string) {
  return new NextRequest(`https://click.example${url}`);
}

describe('/api/hub/devices', () => {
  beforeEach(() => {
    mockRequireBearerUser.mockReset();
    mockCreateAdmin.mockReset();
    mockAssertHubReadable.mockReset().mockResolvedValue(null);
    mockRequireBearerUser.mockResolvedValue({ ok: true, user: { id: USER_ID }, bearer: 'jwt' });
  });

  it('rejects unauthenticated discovery before admin access', async () => {
    mockRequireBearerUser.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    });

    const response = await GET(request('/api/hub/devices?hub_id=hub-123'));

    expect(response.status).toBe(401);
    expect(mockCreateAdmin).not.toHaveBeenCalled();
  });

  it('returns only active X25519 v2 devices for authorized hub participants', async () => {
    const participantQuery: any = {};
    participantQuery.select = jest.fn(() => participantQuery);
    participantQuery.eq = jest.fn(() => participantQuery);
    participantQuery.then = (resolve: (value: unknown) => unknown) => Promise.resolve(resolve({
      data: [{ user_id: USER_ID }, { user_id: USER_ID }],
      error: null,
    }));
    const deviceQuery: any = {};
    deviceQuery.select = jest.fn(() => deviceQuery);
    deviceQuery.in = jest.fn(() => deviceQuery);
    deviceQuery.eq = jest.fn(() => deviceQuery);
    deviceQuery.is = jest.fn(() => deviceQuery);
    deviceQuery.order = jest.fn().mockResolvedValue({
      data: [{ user_id: USER_ID, device_id: 'device-a', crypto_version: 2 }],
      error: null,
    });
    mockCreateAdmin.mockReturnValue({
      from: jest.fn((table: string) => table === 'hub_participants' ? participantQuery : deviceQuery),
    });

    const response = await GET(request('/api/hub/devices?hubId=hub-123'));

    expect(response.status).toBe(200);
    expect(mockAssertHubReadable).toHaveBeenCalledWith(expect.anything(), HUB_ID, USER_ID);
    expect(deviceQuery.in).toHaveBeenCalledWith('user_id', [USER_ID]);
    expect(await response.json()).toEqual({
      hub_id: HUB_ID,
      devices: [{ user_id: USER_ID, device_id: 'device-a', crypto_version: 2 }],
    });
  });
});
