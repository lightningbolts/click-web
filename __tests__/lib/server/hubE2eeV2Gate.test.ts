/** @jest-environment node */

import {
  assertHubE2eeV2MessageWrite,
  HUB_E2EE_V2_REQUIRED,
} from '@/lib/server/hubE2eeV2Gate';

const HUB_ID = 'hub-123';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const SENDER = 'device-a';
const CLIENT_MESSAGE_ID = 'message-1';
const ACTIVE_DEVICE = {
  id: 'device-row-a',
  user_id: USER_ID,
  device_id: SENDER,
  key_algorithm: 'X25519',
  crypto_version: 2,
  revoked_at: null,
};

function messageEnvelope(overrides: Record<string, unknown> = {}): string {
  const value = {
    v: 2,
    type: 'message',
    chatId: HUB_ID,
    epoch: 7,
    senderDeviceId: SENDER,
    cryptoVersion: 2,
    clientMessageId: CLIENT_MESSAGE_ID,
    nonce: Buffer.alloc(12).toString('base64'),
    ciphertext: Buffer.alloc(16).toString('base64'),
    ...overrides,
  };
  return `e2e2:${Buffer.from(JSON.stringify(value), 'utf8').toString('base64')}`;
}

function adminFor(
  epoch: number | null,
  participant: boolean,
  device: Record<string, unknown> | null,
  options: { activeDevices?: Array<Record<string, unknown>>; recipientDeviceIds?: string[] } = {},
) {
  const activeDevices = options.activeDevices ?? (device ? [device] : []);
  const recipientDeviceIds = options.recipientDeviceIds ?? activeDevices.map((row) => String(row.id));
  const from = jest.fn((table: string) => {
    const chain: any = {};
    chain.select = jest.fn(() => chain);
    chain.eq = jest.fn(() => chain);
    chain.order = jest.fn(() => chain);
    chain.limit = jest.fn(() => chain);
    chain.is = jest.fn(() => chain);
    chain.in = jest.fn(() => chain);
    chain.then = (resolve: (value: unknown) => unknown) =>
      Promise.resolve({
        data: table === 'hub_participants'
          ? [{ user_id: USER_ID }]
          : table === 'hub_recipient_key_envelopes'
            ? recipientDeviceIds.map((recipientDeviceId) => ({ recipient_device_id: recipientDeviceId }))
            : table === 'chat_devices'
              ? activeDevices
              : device ? [device] : [ACTIVE_DEVICE],
        error: null,
      }).then(resolve);
    const response = table === 'hub_key_epochs'
      ? { data: epoch === null ? null : { epoch }, error: null }
      : table === 'hub_participants'
        ? { data: participant ? { user_id: USER_ID } : null, error: null }
        : { data: device, error: null };
    chain.maybeSingle = jest.fn().mockResolvedValue(response);
    return chain;
  });
  return { from } as any;
}

describe('hub E2EE v2 message write gate', () => {
  it('allows legacy content before the hub has an epoch', async () => {
    await expect(assertHubE2eeV2MessageWrite(adminFor(null, true, null), {
      hubId: HUB_ID,
      userId: USER_ID,
      content: 'legacy text',
    })).resolves.toEqual({ ok: true, currentEpoch: null });
  });

  it('requires e2e2 content after the hub has an epoch', async () => {
    const result = await assertHubE2eeV2MessageWrite(adminFor(7, true, ACTIVE_DEVICE), {
      hubId: HUB_ID,
      userId: USER_ID,
      content: 'legacy text',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(409);
      expect(await result.response.json()).toEqual({
        error: 'E2EE v2 is required for this hub',
        code: HUB_E2EE_V2_REQUIRED,
      });
    }
  });

  it.each([
    ['wrong hub', { chatId: 'hub-other' }],
    ['wrong epoch', { epoch: 8 }],
    ['wrong sender', { senderDeviceId: 'device-b' }],
    ['wrong client message id', { clientMessageId: 'message-2' }],
  ])('rejects %s authenticated metadata', async (_name, override) => {
    const result = await assertHubE2eeV2MessageWrite(adminFor(7, true, ACTIVE_DEVICE), {
      hubId: HUB_ID,
      userId: USER_ID,
      content: messageEnvelope(override),
      epoch: 7,
      senderDeviceId: SENDER,
      clientMessageId: CLIENT_MESSAGE_ID,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(400);
  });

  it('requires both an active hub participant and an active caller-owned device', async () => {
    const notParticipant = await assertHubE2eeV2MessageWrite(adminFor(7, false, ACTIVE_DEVICE), {
      hubId: HUB_ID,
      userId: USER_ID,
      content: messageEnvelope(),
      epoch: 7,
      senderDeviceId: SENDER,
      clientMessageId: CLIENT_MESSAGE_ID,
    });
    expect(notParticipant.ok).toBe(false);
    if (!notParticipant.ok) expect(notParticipant.response.status).toBe(403);

    const revoked = await assertHubE2eeV2MessageWrite(adminFor(7, true, null), {
      hubId: HUB_ID,
      userId: USER_ID,
      content: messageEnvelope(),
      epoch: 7,
      senderDeviceId: SENDER,
      clientMessageId: CLIENT_MESSAGE_ID,
    });
    expect(revoked.ok).toBe(false);
    if (!revoked.ok) expect(revoked.response.status).toBe(403);
  });

  it('accepts a current-epoch message from an active caller-owned device', async () => {
    const result = await assertHubE2eeV2MessageWrite(adminFor(7, true, ACTIVE_DEVICE), {
      hubId: HUB_ID,
      userId: USER_ID,
      content: messageEnvelope(),
      epoch: 7,
      senderDeviceId: SENDER,
      clientMessageId: CLIENT_MESSAGE_ID,
    });

    expect(result.ok).toBe(true);
  });

  it('requires epoch rotation when a hub device set changes', async () => {
    const result = await assertHubE2eeV2MessageWrite(adminFor(7, true, ACTIVE_DEVICE, {
      activeDevices: [
        ACTIVE_DEVICE,
        { id: 'device-row-new', user_id: USER_ID, device_id: 'device-b' },
      ],
      recipientDeviceIds: ['device-row-a'],
    }), {
      hubId: HUB_ID,
      userId: USER_ID,
      content: messageEnvelope(),
      epoch: 7,
      senderDeviceId: SENDER,
      clientMessageId: CLIENT_MESSAGE_ID,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(409);
  });
});
