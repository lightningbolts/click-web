/** @jest-environment node */

import { NextRequest, NextResponse } from 'next/server';
import { GET, POST } from '@/app/api/chat/epochs/route';
import { parseE2eeV2Envelope } from '@/lib/chat/e2eeV2';

const mockRequireBearerUser = jest.fn();
const mockCreateAdmin = jest.fn();
const mockAssertChatWritable = jest.fn();

jest.mock('@/lib/chat/e2eeV2', () => ({
  parseE2eeV2Envelope: jest.fn(),
}));
jest.mock('@/lib/server/chatGatekeeper', () => ({
  requireBearerUser: (...args: unknown[]) => mockRequireBearerUser(...args),
  createChatGatekeeperAdmin: (...args: unknown[]) => mockCreateAdmin(...args),
  assertChatWritable: (...args: unknown[]) => mockAssertChatWritable(...args),
}));

const USER_ID = '11111111-1111-4111-8111-111111111111';
const CHAT_ID = '22222222-2222-4222-8222-222222222222';
const SENDER = 'ios-device-1';
const RECIPIENT = 'android-device-1';
const ENVELOPE = 'e2e2:opaque-envelope';

function request(url: string, init?: ConstructorParameters<typeof NextRequest>[1]) {
  return new NextRequest(`https://click.example${url}`, init);
}

function authenticated() {
  mockRequireBearerUser.mockResolvedValue({ ok: true, user: { id: USER_ID }, bearer: 'jwt' });
}

describe('/api/chat/epochs', () => {
  beforeEach(() => {
    mockRequireBearerUser.mockReset();
    mockCreateAdmin.mockReset();
    mockAssertChatWritable.mockReset().mockResolvedValue(null);
    (parseE2eeV2Envelope as jest.Mock).mockReset();
  });

  it('rejects unauthenticated lifecycle and retrieval requests before admin access', async () => {
    mockRequireBearerUser.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    });

    const post = await POST(request('/api/chat/epochs', { method: 'POST' }));
    const get = await GET(request(`/api/chat/epochs?chatId=${CHAT_ID}&deviceId=${SENDER}`));

    expect(post.status).toBe(401);
    expect(get.status).toBe(401);
    expect(mockCreateAdmin).not.toHaveBeenCalled();
  });

  it('rejects malformed or metadata-mismatched wraps before the lifecycle RPC', async () => {
    authenticated();
    mockCreateAdmin.mockReturnValue({ rpc: jest.fn() });
    (parseE2eeV2Envelope as jest.Mock).mockReturnValue({
      type: 'epoch-key-wrap',
      chatId: CHAT_ID,
      epoch: 4,
      senderDeviceId: 'wrong-sender',
      recipientDeviceId: RECIPIENT,
    });

    const response = await POST(request('/api/chat/epochs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chatId: CHAT_ID,
        epoch: 4,
        senderDeviceId: SENDER,
        membershipFingerprint: 'members-v4',
        envelopes: [{ recipientDeviceId: RECIPIENT, envelope: ENVELOPE }],
      }),
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: 'Invalid E2EE v2 epoch request',
      code: 'E2EE_V2_INVALID',
    });
    expect(mockCreateAdmin.mock.results[0]?.value.rpc).not.toHaveBeenCalled();
  });

  it('authorizes and atomically delegates a strictly matched epoch set', async () => {
    authenticated();
    (parseE2eeV2Envelope as jest.Mock).mockReturnValue({
      type: 'epoch-key-wrap',
      chatId: CHAT_ID,
      epoch: 4,
      senderDeviceId: SENDER,
      recipientDeviceId: RECIPIENT,
    });
    const rpc = jest.fn().mockResolvedValue({
      data: { chat_id: CHAT_ID, epoch: 4, recipient_count: 1 },
      error: null,
    });
    mockCreateAdmin.mockReturnValue({ rpc });

    const response = await POST(request('/api/chat/epochs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        epoch: 4,
        sender_device_id: SENDER,
        membership_fingerprint: 'members-v4',
        envelopes: [{ recipient_device_id: RECIPIENT, envelope: ENVELOPE }],
      }),
    }));

    expect(response.status).toBe(201);
    expect(mockAssertChatWritable).toHaveBeenCalledWith(expect.anything(), USER_ID, CHAT_ID);
    expect(rpc).toHaveBeenCalledWith('create_or_rotate_chat_epoch', {
      p_chat_id: CHAT_ID,
      p_actor_user_id: USER_ID,
      p_sender_device_id: SENDER,
      p_epoch: 4,
      p_membership_fingerprint: 'members-v4',
      p_envelopes: [{ recipient_device_id: RECIPIENT, sender_device_id: SENDER, envelope: ENVELOPE }],
    });
  });

  it('retrieves envelopes through the caller-scoped device RPC only', async () => {
    authenticated();
    const rpc = jest.fn().mockResolvedValue({
      data: [{ epoch: 4, recipient_device_id: 'device-row', envelope: ENVELOPE }],
      error: null,
    });
    const epochQuery: any = {};
    epochQuery.select = jest.fn(() => epochQuery);
    epochQuery.eq = jest.fn(() => epochQuery);
    epochQuery.order = jest.fn(() => epochQuery);
    epochQuery.limit = jest.fn(() => epochQuery);
    epochQuery.maybeSingle = jest.fn().mockResolvedValue({ data: { epoch: 4 }, error: null });
    mockCreateAdmin.mockReturnValue({ rpc, from: jest.fn().mockReturnValue(epochQuery) });

    const response = await GET(request(`/api/chat/epochs?chat_id=${CHAT_ID}&device_id=${SENDER}`));

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith('get_chat_key_envelopes_for_device', {
      p_chat_id: CHAT_ID,
      p_user_id: USER_ID,
      p_device_id: SENDER,
    });
    expect(await response.json()).toEqual({
      chat_id: CHAT_ID,
      device_id: SENDER,
      current_epoch: 4,
      membership_fingerprint: null,
      envelopes: [{ epoch: 4, recipient_device_id: 'device-row', envelope: ENVELOPE }],
    });
  });
});
