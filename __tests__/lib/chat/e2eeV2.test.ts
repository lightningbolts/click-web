/** @jest-environment node */

import * as e2ee from '@/lib/chat/e2eeV2';

const metadata = {
  chatId: '11111111-1111-4111-8111-111111111111',
  epoch: 7,
  senderDeviceId: 'sender-device-01',
  clientMessageId: '22222222-2222-4222-8222-222222222222',
};

function alteredEnvelope(wire: string, mutate: (value: Record<string, unknown>) => void): string {
  const json = Buffer.from(wire.slice(e2ee.E2EE_V2_PREFIX.length), 'base64').toString('utf8');
  const value = JSON.parse(json) as Record<string, unknown>;
  mutate(value);
  return e2ee.E2EE_V2_PREFIX + Buffer.from(JSON.stringify(value), 'utf8').toString('base64');
}

describe('E2EE v2 foundation', () => {
  it('generates non-extractable X25519 identity and imports/exports public SPKI', async () => {
    const identity = await e2ee.generateDeviceIdentity();
    expect(identity.privateKey.extractable).toBe(false);
    expect(identity.privateKey.type).toBe('private');
    expect(identity.publicKeySpkiBase64).toMatch(/^[A-Za-z0-9+/]+=*$/);

    const imported = await e2ee.importPublicKeySpkiBase64(identity.publicKeySpkiBase64);
    expect(await e2ee.exportPublicKeySpkiBase64(imported)).toBe(identity.publicKeySpkiBase64);
  });

  it('round-trips a message and fails closed for authenticated metadata mismatches', async () => {
    const epochKey = e2ee.generateEpochKey();
    const envelope = await e2ee.encryptMessage({ ...metadata, epochKey, plaintext: 'secret' });
    await expect(e2ee.decryptMessage({ ...metadata, epochKey, envelope })).resolves.toBe('secret');

    for (const mismatch of [
      { chatId: '33333333-3333-4333-8333-333333333333' },
      { epoch: 8 },
      { senderDeviceId: 'other-device' },
      { clientMessageId: '44444444-4444-4444-8444-444444444444' },
    ]) {
      await expect(
        e2ee.decryptMessage({ ...metadata, ...mismatch, epochKey, envelope }),
      ).rejects.toThrow(/metadata mismatch/i);
    }
  });

  it('rejects tampered and truncated ciphertext without returning plaintext', async () => {
    const epochKey = e2ee.generateEpochKey();
    const envelope = await e2ee.encryptMessage({ ...metadata, epochKey, plaintext: 'secret' });
    const tampered = alteredEnvelope(envelope, (value) => {
      const ciphertext = value.ciphertext as string;
      value.ciphertext = ciphertext.slice(0, -2) + (ciphertext.endsWith('A') ? 'B' : 'A') + ciphertext.slice(-1);
    });
    await expect(e2ee.decryptMessage({ ...metadata, epochKey, envelope: tampered })).rejects.toThrow(
      /authentication failed/i,
    );
    await expect(
      e2ee.decryptMessage({ ...metadata, epochKey, envelope: envelope.slice(0, -8) }),
    ).rejects.toThrow();
  });

  it('wraps and unwraps epoch keys and rejects wrong recipient/chat/epoch', async () => {
    const sender = await e2ee.generateDeviceIdentity();
    const recipient = await e2ee.generateDeviceIdentity();
    const wrongRecipient = await e2ee.generateDeviceIdentity();
    const wrapMetadata = {
      chatId: metadata.chatId,
      epoch: metadata.epoch,
      senderDeviceId: metadata.senderDeviceId,
      recipientDeviceId: 'recipient-device-01',
    };
    const epochKey = e2ee.generateEpochKey();
    const envelope = await e2ee.wrapEpochKey({
      ...wrapMetadata,
      epochKey,
      recipientPublicKey: recipient.publicKey,
    });

    await expect(
      e2ee.unwrapEpochKey({ ...wrapMetadata, envelope, recipientPrivateKey: recipient.privateKey }),
    ).resolves.toEqual(epochKey);
    await expect(
      e2ee.unwrapEpochKey({ ...wrapMetadata, envelope, recipientPrivateKey: wrongRecipient.privateKey }),
    ).rejects.toThrow(/authentication failed/i);
    await expect(
      e2ee.unwrapEpochKey({ ...wrapMetadata, chatId: '55555555-5555-4555-8555-555555555555', envelope, recipientPrivateKey: recipient.privateKey }),
    ).rejects.toThrow(/metadata mismatch/i);
    await expect(
      e2ee.unwrapEpochKey({ ...wrapMetadata, epoch: 8, envelope, recipientPrivateKey: recipient.privateKey }),
    ).rejects.toThrow(/metadata mismatch/i);
    expect(sender.privateKey.extractable).toBe(false);
  });

  it('rejects replays, tracks nonce reuse, and emits a unique nonce per encryption', async () => {
    const epochKey = e2ee.generateEpochKey();
    const first = await e2ee.encryptMessage({ ...metadata, epochKey, plaintext: 'one' });
    const second = await e2ee.encryptMessage({ ...metadata, epochKey, plaintext: 'two' });
    const firstParsed = e2ee.parseE2eeV2Envelope(first);
    const secondParsed = e2ee.parseE2eeV2Envelope(second);
    expect(firstParsed.type).toBe('message');
    expect(secondParsed.type).toBe('message');
    expect(firstParsed.nonce).not.toBe(secondParsed.nonce);

    const guard = new e2ee.ReplayGuard();
    await expect(e2ee.decryptMessage({ ...metadata, epochKey, envelope: first, replayGuard: guard })).resolves.toBe('one');
    expect(guard.size).toBe(1);
    await expect(e2ee.decryptMessage({ ...metadata, epochKey, envelope: first, replayGuard: guard })).rejects.toThrow(/replay|nonce reuse/i);
    expect(guard.hasSeenNonce(firstParsed.nonce)).toBe(true);
  });

  it('rejects malformed envelopes and enforces strict key/identifier inputs', async () => {
    const epochKey = e2ee.generateEpochKey();
    expect(() => e2ee.parseE2eeV2Envelope('e2e2:not-base64')).toThrow();
    expect(() => e2ee.parseE2eeV2Envelope('e2e:legacy')).toThrow(/not an e2e2/i);
    await expect(e2ee.encryptMessage({ ...metadata, epochKey: new Uint8Array(31), plaintext: 'x' })).rejects.toThrow(/32 bytes/);
    await expect(e2ee.encryptMessage({ ...metadata, epoch: 0, epochKey, plaintext: 'x' })).rejects.toThrow(/positive integer/);
    await expect(e2ee.encryptMessage({ ...metadata, chatId: 'bad id', epochKey, plaintext: 'x' })).rejects.toThrow(/identifier/);
    await expect(e2ee.encryptMessage({ ...metadata, epochKey, plaintext: 'x', senderDeviceId: 'sender-device-01' })).resolves.toMatch(/^e2e2:/);
  });

  it('does not expose a private-key export API and preserves v1 compatibility', async () => {
    expect((e2ee as Record<string, unknown>).exportPrivateKey).toBeUndefined();
    expect((e2ee as Record<string, unknown>).exportPrivateKeySpkiBase64).toBeUndefined();
    const legacy = 'e2e:' + 'opaque-v1-content';
    const epochKey = e2ee.generateEpochKey();
    expect(await e2ee.decryptContentCompatible(legacy, { ...metadata, epochKey })).toBe(legacy);

    const v2 = await e2ee.encryptMessage({ ...metadata, epochKey, plaintext: 'v2' });
    await expect(e2ee.decryptContentCompatible(v2, { ...metadata, epochKey })).resolves.toBe('v2');
  });

  it('creates a strict media authorization envelope with an authenticated ciphertext digest', async () => {
    const epochKey = e2ee.generateEpochKey();
    const mediaCiphertextSha256 = 'ypeBEsobvcr6wjGzmiPcTaeG7/gUfE5yuYB3ha/uSLs=';
    const envelope = await e2ee.authorizeMedia({ ...metadata, epochKey, mediaCiphertextSha256 });
    expect(e2ee.parseE2eeV2Envelope(envelope)).toMatchObject({
      type: 'media',
      chatId: metadata.chatId,
      epoch: metadata.epoch,
      mediaCiphertextSha256,
    });
  });

  it('round-trips encrypted media payloads and rejects digest or metadata tampering', async () => {
    const epochKey = e2ee.generateEpochKey();
    const plaintext = new TextEncoder().encode('private media bytes');
    const encrypted = await e2ee.encryptMediaPayload({ ...metadata, epochKey, plaintext });

    await expect(
      e2ee.decryptMediaPayload(metadata, epochKey, encrypted.payload, encrypted.mediaCiphertextSha256),
    ).resolves.toEqual(plaintext);
    await expect(
      e2ee.decryptMediaPayload({ ...metadata, clientMessageId: '44444444-4444-4444-8444-444444444444' }, epochKey, encrypted.payload, encrypted.mediaCiphertextSha256),
    ).rejects.toThrow(/operation|authentication|digest/i);
    await expect(
      e2ee.decryptMediaPayload(metadata, epochKey, encrypted.payload, 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='),
    ).rejects.toThrow(/digest mismatch/i);
  });
});
