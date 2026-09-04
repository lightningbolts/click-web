/** @jest-environment node */

import { NextRequest, NextResponse } from 'next/server';
import { POST } from '@/app/api/hub/messages/route';

const mockRequireBearerUser = jest.fn();
const mockCreateAdmin = jest.fn();
const mockParseBody = jest.fn();
const mockIsRateLimited = jest.fn();
const mockAssertHubGeofence = jest.fn();
const mockAssertHubE2ee = jest.fn();
const mockAssertHubMediaMessage = jest.fn();

jest.mock('@/lib/server/chatGatekeeper', () => ({
  requireBearerUser: (...args: unknown[]) => mockRequireBearerUser(...args),
  createChatGatekeeperAdmin: (...args: unknown[]) => mockCreateAdmin(...args),
}));

jest.mock('@/lib/api/parseBody', () => ({
  parseBody: (...args: unknown[]) => mockParseBody(...args),
}));

jest.mock('@/lib/server/rateLimit', () => ({
  HUB_MESSAGE_RATE_LIMIT: 30,
  HUB_MESSAGE_RATE_LIMIT_BINDING: 'HUB_MESSAGE_RATE_LIMITER',
  HUB_MUTATION_RATE_WINDOW_MS: 60_000,
  isRateLimited: (...args: unknown[]) => mockIsRateLimited(...args),
}));

jest.mock('@/lib/server/hubGatekeeper', () => ({
  assertHubGeofenceFromCoords: (...args: unknown[]) => mockAssertHubGeofence(...args),
  assertHubReadable: jest.fn(),
}));

jest.mock('@/lib/server/hubE2eeV2Gate', () => ({
  assertHubE2eeV2MessageWrite: (...args: unknown[]) => mockAssertHubE2ee(...args),
  assertHubE2eeV2MediaMessageWrite: (...args: unknown[]) => mockAssertHubMediaMessage(...args),
}));

jest.mock('@/lib/hub/notifyHubMessage', () => ({
  notifyHubMessageParticipants: jest.fn(),
}));

const USER_ID = '11111111-1111-4111-8111-111111111111';
const HUB_ID = 'hub-123';

function request() {
  return new NextRequest('https://click.example/api/hub/messages', { method: 'POST' });
}

function admin() {
  const participantQuery: any = {};
  participantQuery.upsert = jest.fn().mockResolvedValue({ error: null });
  const insertQuery: any = {};
  insertQuery.insert = jest.fn(() => insertQuery);
  insertQuery.select = jest.fn(() => insertQuery);
  insertQuery.single = jest.fn().mockResolvedValue({ data: { id: 'message-1' }, error: null });
  return {
    from: jest.fn((table: string) => table === 'hub_participants' ? participantQuery : insertQuery),
  };
}

describe('/api/hub/messages E2EE v2 write boundary', () => {
  beforeEach(() => {
    mockRequireBearerUser.mockReset().mockResolvedValue({ ok: true, user: { id: USER_ID }, bearer: 'jwt' });
    mockCreateAdmin.mockReset().mockReturnValue(admin());
    mockParseBody.mockReset();
    mockIsRateLimited.mockReset().mockResolvedValue(false);
    mockAssertHubGeofence.mockReset().mockResolvedValue(null);
    mockAssertHubE2ee.mockReset().mockResolvedValue({ ok: true, currentEpoch: 3 });
    mockAssertHubMediaMessage.mockReset().mockReturnValue({ ok: true });
  });

  it('returns the stable required error for legacy content on an upgraded hub', async () => {
    mockParseBody.mockResolvedValue({
      ok: true,
      data: { hub_id: HUB_ID, body: 'legacy text', user_lat: 1, user_long: 2 },
    });
    const denied = NextResponse.json({ error: 'E2EE v2 is required for this hub' }, { status: 409 });
    mockAssertHubE2ee.mockResolvedValue({ ok: false, response: denied });

    const response = await POST(request());

    expect(response.status).toBe(409);
    expect(mockAssertHubE2ee).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      hubId: HUB_ID,
      userId: USER_ID,
      content: 'legacy text',
    }));
  });

  it('passes ciphertext metadata to the hub-specific gate before inserting', async () => {
    mockParseBody.mockResolvedValue({
      ok: true,
      data: {
        hub_id: HUB_ID,
        body: 'e2e2:ciphertext',
        user_lat: 1,
        user_long: 2,
        metadata: { epoch: 3, sender_device_id: 'device-a', client_message_id: 'message-1' },
      },
    });

    const response = await POST(request());

    expect(response.status).toBe(201);
    expect(mockAssertHubE2ee).toHaveBeenCalledWith(expect.anything(), {
      hubId: HUB_ID,
      userId: USER_ID,
      content: 'e2e2:ciphertext',
      epoch: 3,
      senderDeviceId: 'device-a',
      clientMessageId: 'message-1',
    });
  });

  it('rejects v2 image rows without the authenticated media binding', async () => {
    mockAssertHubE2ee.mockResolvedValue({
      ok: true,
      currentEpoch: 3,
      envelope: {
        chatId: HUB_ID,
        epoch: 3,
        senderDeviceId: 'device-a',
        clientMessageId: 'message-1',
      },
    });
    mockParseBody.mockResolvedValue({
      ok: true,
      data: {
        hub_id: HUB_ID,
        body: 'e2e2:ciphertext',
        message_type: 'image',
        user_lat: 1,
        user_long: 2,
        metadata: { epoch: 3, sender_device_id: 'device-a', client_message_id: 'message-1' },
      },
    });
    mockAssertHubMediaMessage.mockReturnValue({
      ok: false,
      response: NextResponse.json({ error: 'Hub E2EE v2 media message metadata is required' }, { status: 400 }),
    });

    const response = await POST(request());

    expect(response.status).toBe(400);
    expect(mockAssertHubMediaMessage).toHaveBeenCalledWith(expect.objectContaining({
      hubId: HUB_ID,
      metadata: expect.objectContaining({ epoch: 3 }),
    }));
  });
});
