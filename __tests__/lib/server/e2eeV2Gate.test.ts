/** @jest-environment node */

import {
  assertE2eeV2MediaUpload,
  assertE2eeV2MediaMessageWrite,
  assertE2eeV2MessageWrite,
  E2EE_V2_REQUIRED,
} from '@/lib/server/e2eeV2Gate';

const CHAT_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const SENDER = 'device-a';
const CLIENT_MESSAGE_ID = '33333333-3333-4333-8333-333333333333';

function envelope(overrides: Record<string, unknown> = {}): string {
  const value = {
    v: 2,
    type: 'message',
    chatId: CHAT_ID,
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

function mediaEnvelope(overrides: Record<string, unknown> = {}): string {
  const value = {
    v: 2,
    type: 'media',
    chatId: CHAT_ID,
    epoch: 7,
    senderDeviceId: SENDER,
    cryptoVersion: 2,
    clientMessageId: CLIENT_MESSAGE_ID,
    mediaCiphertextSha256: 'ypeBEsobvcr6wjGzmiPcTaeG7/gUfE5yuYB3ha/uSLs=',
    nonce: Buffer.alloc(12).toString('base64'),
    ciphertext: Buffer.alloc(32).toString('base64'),
    ...overrides,
  };
  return `e2e2:${Buffer.from(JSON.stringify(value), 'utf8').toString('base64')}`;
}

function adminFor(
  epoch: number | null,
  device: Record<string, unknown> | null,
  options: { activeDevices?: Array<Record<string, unknown>>; recipientDeviceIds?: string[] } = {},
) {
  const activeDevices = options.activeDevices ?? (device ? [device] : []);
  const recipientDeviceIds = options.recipientDeviceIds ?? activeDevices.map((row) => String(row.id));
  const from = jest.fn((table: string) => {
    if (table === 'chat_key_epochs') {
      const chain: any = {};
      chain.select = jest.fn(() => chain);
      chain.eq = jest.fn(() => chain);
      chain.order = jest.fn(() => chain);
      chain.limit = jest.fn(() => chain);
      chain.maybeSingle = jest.fn().mockResolvedValue({
        data: epoch === null ? null : { epoch },
        error: null,
      });
      return chain;
    }
    if (table === 'chat_recipient_key_envelopes') {
      const chain: any = {};
      chain.select = jest.fn(() => chain);
      chain.eq = jest.fn(() => chain);
      chain.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
        Promise.resolve({
          data: recipientDeviceIds.map((recipientDeviceId) => ({ recipient_device_id: recipientDeviceId })),
          error: null,
        }).then(resolve, reject);
      return chain;
    }
    const chain: any = {};
    chain.select = jest.fn(() => chain);
    chain.eq = jest.fn(() => chain);
    chain.is = jest.fn(() => chain);
    chain.in = jest.fn(() => chain);
    chain.maybeSingle = jest.fn().mockResolvedValue({ data: device, error: null });
    chain.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve({
        data: activeDevices.map((row) => ({ id: row.id, user_id: row.user_id })),
        error: null,
      }).then(resolve, reject);
    return chain;
  });
  return {
    from,
    rpc: jest.fn().mockResolvedValue({ data: [USER_ID], error: null }),
  } as any;
}

describe('E2EE v2 message write gate', () => {
  it('allows legacy reads/writes before a chat has an epoch', async () => {
    const result = await assertE2eeV2MessageWrite(adminFor(null, null), {
      chatId: CHAT_ID,
      userId: USER_ID,
      content: 'legacy text',
    });

    expect(result).toEqual({ ok: true, currentEpoch: null });
  });

  it('fails closed with the stable error for every legacy write after rollout', async () => {
    const result = await assertE2eeV2MessageWrite(adminFor(7, null), {
      chatId: CHAT_ID,
      userId: USER_ID,
      content: 'legacy text',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(409);
      expect(await result.response.json()).toEqual({
        error: 'E2EE v2 is required for this chat',
        code: E2EE_V2_REQUIRED,
      });
    }
  });

  it.each(['call_log', 'beacon'])('does not allow %s callers to bypass the v2 write gate', async () => {
    const result = await assertE2eeV2MessageWrite(adminFor(7, null), {
      chatId: CHAT_ID,
      userId: USER_ID,
      content: 'legacy structured content',
      allowLegacy: true,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(409);
  });

  it.each([
    ['wrong chat', { chatId: '44444444-4444-4444-8444-444444444444' }],
    ['wrong epoch', { epoch: 8 }],
    ['wrong sender', { senderDeviceId: 'device-b' }],
    ['wrong client message id', { clientMessageId: '55555555-5555-4555-8555-555555555555' }],
  ])('rejects %s authenticated metadata before device lookup', async (_name, override) => {
    const result = await assertE2eeV2MessageWrite(adminFor(7, null), {
      chatId: CHAT_ID,
      userId: USER_ID,
      content: envelope(),
      epoch: 7,
      senderDeviceId: SENDER,
      clientMessageId: CLIENT_MESSAGE_ID,
      ...override,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(400);
  });

  it('rejects malformed and revoked sender devices without exposing envelope content', async () => {
    const malformed = await assertE2eeV2MessageWrite(adminFor(7, null), {
      chatId: CHAT_ID,
      userId: USER_ID,
      content: 'e2e2:not-base64',
      epoch: 7,
      senderDeviceId: SENDER,
      clientMessageId: CLIENT_MESSAGE_ID,
    });
    expect(malformed.ok).toBe(false);

    const revoked = await assertE2eeV2MessageWrite(adminFor(7, null), {
      chatId: CHAT_ID,
      userId: USER_ID,
      content: envelope(),
      epoch: 7,
      senderDeviceId: SENDER,
      clientMessageId: CLIENT_MESSAGE_ID,
    });
    expect(revoked.ok).toBe(false);
    if (!revoked.ok) {
      const body = await revoked.response.json();
      expect(JSON.stringify(body)).not.toContain('e2e2:');
    }
  });

  it('accepts only an active caller-owned sender device at the current epoch', async () => {
    const result = await assertE2eeV2MessageWrite(
      adminFor(7, {
        id: 'device-row-a',
        user_id: USER_ID,
        device_id: SENDER,
        key_algorithm: 'X25519',
        crypto_version: 2,
        revoked_at: null,
      }),
      {
        chatId: CHAT_ID,
        userId: USER_ID,
        content: envelope(),
        epoch: 7,
        senderDeviceId: SENDER,
        clientMessageId: CLIENT_MESSAGE_ID,
      },
    );

    expect(result.ok).toBe(true);
  });

  it('requires epoch rotation when an active device is added after the current epoch', async () => {
    const result = await assertE2eeV2MessageWrite(
      adminFor(7, {
        id: 'device-row-a',
        user_id: USER_ID,
        device_id: SENDER,
        key_algorithm: 'X25519',
        crypto_version: 2,
        revoked_at: null,
      }, {
        activeDevices: [
          {
            id: 'device-row-a',
            user_id: USER_ID,
          },
          {
            id: 'device-row-new',
            user_id: USER_ID,
          },
        ],
        recipientDeviceIds: ['device-row-a'],
      }),
      {
        chatId: CHAT_ID,
        userId: USER_ID,
        content: envelope(),
        epoch: 7,
        senderDeviceId: SENDER,
        clientMessageId: CLIENT_MESSAGE_ID,
      },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(409);
  });

  it('binds media authorization to the exact uploaded ciphertext digest', async () => {
    const digest = 'ypeBEsobvcr6wjGzmiPcTaeG7/gUfE5yuYB3ha/uSLs=';
    const admin = adminFor(7, {
      id: 'device-row-a',
      user_id: USER_ID,
      device_id: SENDER,
      key_algorithm: 'X25519',
      crypto_version: 2,
      revoked_at: null,
    });
    const accepted = await assertE2eeV2MediaUpload(admin, {
      chatId: CHAT_ID,
      userId: USER_ID,
      content: mediaEnvelope(),
      mediaCiphertextSha256: digest,
    });
    expect(accepted.ok).toBe(true);

    const rejected = await assertE2eeV2MediaUpload(admin, {
      chatId: CHAT_ID,
      userId: USER_ID,
      content: mediaEnvelope(),
      mediaCiphertextSha256: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
    });
    expect(rejected.ok).toBe(false);
  });

  it('requires v2 media messages to bind the upload authorization to the message envelope', () => {
    const digest = 'ypeBEsobvcr6wjGzmiPcTaeG7/gUfE5yuYB3ha/uSLs=';
    const messageEnvelope = JSON.parse(Buffer.from(envelope().slice('e2e2:'.length), 'base64').toString('utf8'));
    const accepted = assertE2eeV2MediaMessageWrite({
      chatId: CHAT_ID,
      userId: USER_ID,
      messageEnvelope,
      metadata: {
        media_path: `${CHAT_ID}/${USER_ID}/media.bin`,
        media_ciphertext_sha256: digest,
        media_authorization_envelope: mediaEnvelope(),
      },
    });
    expect(accepted).toEqual({ ok: true });

    const rejected = assertE2eeV2MediaMessageWrite({
      chatId: CHAT_ID,
      userId: USER_ID,
      messageEnvelope,
      metadata: {
        media_path: `${CHAT_ID}/${USER_ID}/media.bin`,
        media_ciphertext_sha256: digest,
        media_authorization_envelope: mediaEnvelope({ clientMessageId: 'other-client' }),
      },
    });
    expect(rejected.ok).toBe(false);
  });
});
