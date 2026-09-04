/** @jest-environment node */

import { NextRequest, NextResponse } from 'next/server';
import { POST } from '@/app/api/chat/key-transfer/route';

const mockRequireBearerUser = jest.fn();
const mockCreateAdmin = jest.fn();
const mockAssertChatWritable = jest.fn();

jest.mock('@/lib/server/chatGatekeeper', () => ({
  requireBearerUser: (...args: unknown[]) => mockRequireBearerUser(...args),
  createChatGatekeeperAdmin: (...args: unknown[]) => mockCreateAdmin(...args),
  assertChatWritable: (...args: unknown[]) => mockAssertChatWritable(...args),
}));

const USER_ID = '11111111-1111-4111-8111-111111111111';
const CHAT_ID = '22222222-2222-4222-8222-222222222222';
const APPROVER = 'existing-device';
const RECIPIENT = 'new-device';

function historicalEnvelope(): string {
  return `e2e2:${Buffer.from(JSON.stringify({
    v: 2,
    type: 'epoch-key-wrap',
    chatId: CHAT_ID,
    epoch: 1,
    senderDeviceId: APPROVER,
    recipientDeviceId: RECIPIENT,
    cryptoVersion: 2,
    ephemeralPublicKey: Buffer.alloc(44).toString('base64'),
    nonce: Buffer.alloc(12).toString('base64'),
    ciphertext: Buffer.alloc(32).toString('base64'),
  }), 'utf8').toString('base64')}`;
}

function request(init?: ConstructorParameters<typeof NextRequest>[1]) {
  return new NextRequest('https://click.example/api/chat/key-transfer', init);
}

describe('/api/chat/key-transfer', () => {
  beforeEach(() => {
    mockRequireBearerUser.mockReset();
    mockCreateAdmin.mockReset();
    mockAssertChatWritable.mockReset().mockResolvedValue(null);
  });

  it('rejects unauthenticated approval requests before parsing or admin access', async () => {
    mockRequireBearerUser.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    });

    const response = await POST(request({ method: 'POST' }));

    expect(response.status).toBe(401);
    expect(mockCreateAdmin).not.toHaveBeenCalled();
  });

  it('rejects arbitrary extra identity fields and does not call the approval RPC', async () => {
    mockRequireBearerUser.mockResolvedValue({ ok: true, user: { id: USER_ID }, bearer: 'jwt' });
    const rpc = jest.fn();
    mockCreateAdmin.mockReturnValue({ rpc });

    const response = await POST(request({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chatId: CHAT_ID,
        approvingDeviceId: APPROVER,
        recipientDeviceId: RECIPIENT,
        historicalEnvelopes: [],
        userId: 'attacker-controlled-id',
      }),
    }));

    expect(response.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('authorizes an explicit existing-device approval through the service RPC', async () => {
    mockRequireBearerUser.mockResolvedValue({ ok: true, user: { id: USER_ID }, bearer: 'jwt' });
    const rpc = jest.fn().mockResolvedValue({
      data: { chat_id: CHAT_ID, recipient_device_id: 'recipient-row', approved_by_device_id: 'approver-row' },
      error: null,
    });
    mockCreateAdmin.mockReturnValue({ rpc });

    const response = await POST(request({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        approving_device_id: APPROVER,
        recipient_device_id: RECIPIENT,
        historical_envelopes: [{
          epoch: 1,
          recipient_device_id: RECIPIENT,
          sender_device_id: APPROVER,
          envelope: historicalEnvelope(),
        }],
      }),
    }));

    expect(response.status).toBe(201);
    expect(mockAssertChatWritable).toHaveBeenCalledWith(expect.anything(), USER_ID, CHAT_ID);
    expect(rpc).toHaveBeenCalledWith('approve_chat_key_transfer', {
      p_chat_id: CHAT_ID,
      p_actor_user_id: USER_ID,
      p_approving_device_id: APPROVER,
      p_recipient_device_id: RECIPIENT,
      p_historical_envelopes: [{
        epoch: 1,
        recipient_device_id: RECIPIENT,
        sender_device_id: APPROVER,
        envelope: historicalEnvelope(),
      }],
    });
  });
});
