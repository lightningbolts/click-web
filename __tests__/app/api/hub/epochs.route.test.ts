/** @jest-environment node */

import { NextRequest, NextResponse } from 'next/server';
import { GET, POST } from '@/app/api/hub/epochs/route';
import { parseE2eeV2Envelope } from '@/lib/chat/e2eeV2';

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
const SENDER = 'device-a';
const RECIPIENT = 'device-b';

function envelope(overrides: Record<string, unknown> = {}): string {
  return `e2e2:${Buffer.from(JSON.stringify({
    v: 2,
    type: 'epoch-key-wrap',
    chatId: HUB_ID,
    epoch: 1,
    senderDeviceId: SENDER,
    recipientDeviceId: RECIPIENT,
    cryptoVersion: 2,
    ephemeralPublicKey: Buffer.alloc(44).toString('base64'),
    nonce: Buffer.alloc(12).toString('base64'),
    ciphertext: Buffer.alloc(32).toString('base64'),
    ...overrides,
  }), 'utf8').toString('base64')}`;
}

function request(url: string, init?: ConstructorParameters<typeof NextRequest>[1]) {
  return new NextRequest(`https://click.example${url}`, init);
}

describe('/api/hub/epochs', () => {
  beforeEach(() => {
    mockRequireBearerUser.mockReset();
    mockCreateAdmin.mockReset();
    mockAssertHubReadable.mockReset().mockResolvedValue(null);
    mockRequireBearerUser.mockResolvedValue({ ok: true, user: { id: USER_ID }, bearer: 'jwt' });
  });

  it('rejects unauthenticated lifecycle requests before admin access', async () => {
    mockRequireBearerUser.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    });

    const response = await POST(request('/api/hub/epochs', { method: 'POST' }));

    expect(response.status).toBe(401);
    expect(mockCreateAdmin).not.toHaveBeenCalled();
  });

  it('validates envelope metadata before invoking the service RPC', async () => {
    const rpc = jest.fn();
    mockCreateAdmin.mockReturnValue({ rpc });

    const response = await POST(request('/api/hub/epochs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        hub_id: HUB_ID,
        epoch: 1,
        sender_device_id: SENDER,
        membership_fingerprint: 'members-v1',
        envelopes: [{ recipient_device_id: RECIPIENT, envelope: envelope({ chatId: 'wrong-hub' }) }],
      }),
    }));

    expect(response.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('creates an epoch through the service-only RPC after hub authorization', async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: { hub_id: HUB_ID, epoch: 1, recipient_count: 1 },
      error: null,
    });
    mockCreateAdmin.mockReturnValue({ rpc });

    const response = await POST(request('/api/hub/epochs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        hub_id: HUB_ID,
        epoch: 1,
        sender_device_id: SENDER,
        membership_fingerprint: 'members-v1',
        envelopes: [{ recipient_device_id: RECIPIENT, envelope: envelope() }],
      }),
    }));

    expect(response.status).toBe(201);
    expect(mockAssertHubReadable).toHaveBeenCalledWith(expect.anything(), HUB_ID, USER_ID);
    expect(rpc).toHaveBeenCalledWith('create_or_rotate_hub_epoch', {
      p_hub_id: HUB_ID,
      p_actor_user_id: USER_ID,
      p_sender_device_id: SENDER,
      p_epoch: 1,
      p_membership_fingerprint: 'members-v1',
      p_envelopes: [{ recipient_device_id: RECIPIENT, sender_device_id: SENDER, envelope: envelope() }],
    });
  });

  it('returns the current epoch and device-scoped envelopes', async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: [{ epoch: 1, recipient_device_id: 'device-row', envelope: envelope() }],
      error: null,
    });
    const epochQuery: any = {};
    epochQuery.select = jest.fn(() => epochQuery);
    epochQuery.eq = jest.fn(() => epochQuery);
    epochQuery.order = jest.fn(() => epochQuery);
    epochQuery.limit = jest.fn(() => epochQuery);
    epochQuery.maybeSingle = jest.fn().mockResolvedValue({
      data: { epoch: 1, membership_fingerprint: 'members-v1' },
      error: null,
    });
    mockCreateAdmin.mockReturnValue({ rpc, from: jest.fn(() => epochQuery) });

    const response = await GET(request(`/api/hub/epochs?hub_id=${HUB_ID}&device_id=${SENDER}`));

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith('get_hub_key_envelopes_for_device', {
      p_hub_id: HUB_ID,
      p_user_id: USER_ID,
      p_device_id: SENDER,
    });
    expect(await response.json()).toMatchObject({
      hub_id: HUB_ID,
      device_id: SENDER,
      current_epoch: 1,
      membership_fingerprint: 'members-v1',
    });
  });
});

void parseE2eeV2Envelope;
