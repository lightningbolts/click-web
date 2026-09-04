/** @jest-environment node */

import {
  assertHubE2eeV2MediaMessageWrite,
  assertHubE2eeV2MediaUpload,
  HUB_E2EE_V2_REQUIRED,
} from '@/lib/server/hubE2eeV2Gate';

const HUB_ID = 'hub-123';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const SENDER = 'device-a';
const CLIENT_MESSAGE_ID = 'message-1';
const DIGEST = 'ypeBEsobvcr6wjGzmiPcTaeG7/gUfE5yuYB3ha/uSLs=';
const ACTIVE_DEVICE = {
  id: 'device-row-a',
  user_id: USER_ID,
  device_id: SENDER,
  key_algorithm: 'X25519',
  crypto_version: 2,
  revoked_at: null,
};

function mediaEnvelope(overrides: Record<string, unknown> = {}): string {
  const value = {
    v: 2,
    type: 'media',
    chatId: HUB_ID,
    epoch: 7,
    senderDeviceId: SENDER,
    cryptoVersion: 2,
    clientMessageId: CLIENT_MESSAGE_ID,
    mediaCiphertextSha256: DIGEST,
    nonce: Buffer.alloc(12).toString('base64'),
    ciphertext: Buffer.alloc(32).toString('base64'),
    ...overrides,
  };
  return `e2e2:${Buffer.from(JSON.stringify(value), 'utf8').toString('base64')}`;
}

function adminFor(epoch: number | null, participant: boolean, device: Record<string, unknown> | null) {
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
            ? [{ recipient_device_id: 'device-row-a' }]
            : device ? [device] : [],
        error: null,
      }).then(resolve);
    chain.maybeSingle = jest.fn().mockResolvedValue(
      table === 'hub_key_epochs'
        ? { data: epoch === null ? null : { epoch }, error: null }
        : table === 'hub_participants'
          ? { data: participant ? { user_id: USER_ID } : null, error: null }
          : { data: device, error: null },
    );
    return chain;
  });
  return { from } as any;
}

describe('hub E2EE v2 media gates', () => {
  it('preserves legacy uploads before the first hub epoch', async () => {
    await expect(assertHubE2eeV2MediaUpload(adminFor(null, true, null), {
      hubId: HUB_ID,
      userId: USER_ID,
      content: '',
    })).resolves.toEqual({ ok: true, currentEpoch: null });
  });

  it('requires the v2 media envelope after the hub is upgraded', async () => {
    const result = await assertHubE2eeV2MediaUpload(adminFor(7, true, ACTIVE_DEVICE), {
      hubId: HUB_ID,
      userId: USER_ID,
      content: '',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(409);
      expect(await result.response.json()).toMatchObject({ code: HUB_E2EE_V2_REQUIRED });
    }
  });

  it.each([
    ['wrong epoch', { epoch: 8 }],
    ['wrong sender', { senderDeviceId: 'device-b' }],
    ['wrong digest', { mediaCiphertextSha256: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=' }],
  ])('rejects %s media metadata', async (_name, override) => {
    const result = await assertHubE2eeV2MediaUpload(adminFor(7, true, ACTIVE_DEVICE), {
      hubId: HUB_ID,
      userId: USER_ID,
      content: mediaEnvelope(override),
      epoch: 7,
      senderDeviceId: SENDER,
      clientMessageId: CLIENT_MESSAGE_ID,
      mediaCiphertextSha256: DIGEST,
    });
    expect(result.ok).toBe(false);
  });

  it('requires an active participant and device for media authorization', async () => {
    const result = await assertHubE2eeV2MediaUpload(adminFor(7, false, ACTIVE_DEVICE), {
      hubId: HUB_ID,
      userId: USER_ID,
      content: mediaEnvelope(),
      epoch: 7,
      senderDeviceId: SENDER,
      clientMessageId: CLIENT_MESSAGE_ID,
      mediaCiphertextSha256: DIGEST,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
  });

  it('binds image/audio metadata to the message envelope', () => {
    const messageEnvelope = {
      v: 2 as const,
      type: 'message' as const,
      chatId: HUB_ID,
      epoch: 7,
      senderDeviceId: SENDER,
      cryptoVersion: 2 as const,
      clientMessageId: CLIENT_MESSAGE_ID,
      nonce: Buffer.alloc(12).toString('base64'),
      ciphertext: Buffer.alloc(16).toString('base64'),
    };
    expect(assertHubE2eeV2MediaMessageWrite({
      hubId: HUB_ID,
      userId: USER_ID,
      messageEnvelope,
      metadata: {
        epoch: 7,
        sender_device_id: SENDER,
        client_message_id: CLIENT_MESSAGE_ID,
        media_path: `${USER_ID}/hub/${HUB_ID}/media.enc`,
        media_ciphertext_sha256: DIGEST,
        media_authorization_envelope: mediaEnvelope(),
      },
    })).toEqual({ ok: true });

    const missing = assertHubE2eeV2MediaMessageWrite({
      hubId: HUB_ID,
      userId: USER_ID,
      messageEnvelope,
      metadata: { media_ciphertext_sha256: DIGEST },
    });
    expect(missing.ok).toBe(false);
  });
});
