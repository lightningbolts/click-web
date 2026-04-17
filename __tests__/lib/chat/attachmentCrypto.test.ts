import {
  ENVELOPE_PREFIX,
  FILE_MASTER_KEY_BYTES,
  generateFileMasterKey,
  encryptFileBytes,
  decryptFileBytes,
  encodeFileMasterKeyBase64,
  decodeFileMasterKeyBase64,
  sha256Base64,
  encodeEnvelope,
  tryDecodeEnvelope,
  isAttachmentEnvelope,
  type AttachmentEnvelope,
} from '@/lib/chat/attachmentCrypto';

const plaintext = new TextEncoder().encode('%PDF-1.7 hello world');

describe('AttachmentCrypto', () => {
  it('generateFileMasterKey returns a fresh 32-byte key each call', () => {
    const a = generateFileMasterKey();
    const b = generateFileMasterKey();
    expect(a.byteLength).toBe(FILE_MASTER_KEY_BYTES);
    expect(b.byteLength).toBe(FILE_MASTER_KEY_BYTES);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false);
  });

  it('round-trips encrypted bytes', async () => {
    const key = generateFileMasterKey();
    const encrypted = await encryptFileBytes(plaintext, key);
    const decrypted = await decryptFileBytes(encrypted, key);
    expect(Buffer.from(decrypted).equals(Buffer.from(plaintext))).toBe(true);
  });

  it('produces a different ciphertext each call (fresh IV)', async () => {
    const key = generateFileMasterKey();
    const a = await encryptFileBytes(plaintext, key);
    const b = await encryptFileBytes(plaintext, key);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false);
  });

  it('rejects decryption with the wrong key', async () => {
    const key = generateFileMasterKey();
    const wrong = generateFileMasterKey();
    const encrypted = await encryptFileBytes(plaintext, key);
    await expect(decryptFileBytes(encrypted, wrong)).rejects.toThrow(/HMAC/i);
  });

  it('rejects decryption when the ciphertext is tampered', async () => {
    const key = generateFileMasterKey();
    const encrypted = await encryptFileBytes(plaintext, key);
    encrypted[encrypted.length - 1] ^= 0x01;
    await expect(decryptFileBytes(encrypted, key)).rejects.toThrow(/HMAC/i);
  });

  it('rejects keys with the wrong length', async () => {
    await expect(encryptFileBytes(plaintext, new Uint8Array(16))).rejects.toThrow(/32 bytes/);
    await expect(decryptFileBytes(new Uint8Array(128), new Uint8Array(31))).rejects.toThrow(/32 bytes/);
  });

  it('rejects blobs that are too short to be valid', async () => {
    const key = generateFileMasterKey();
    await expect(decryptFileBytes(new Uint8Array(10), key)).rejects.toThrow(/too short/);
  });

  it('round-trips the file-master key via base64', () => {
    const raw = generateFileMasterKey();
    const b64 = encodeFileMasterKeyBase64(raw);
    const back = decodeFileMasterKeyBase64(b64);
    expect(Buffer.from(back).equals(Buffer.from(raw))).toBe(true);
  });

  it('sha256Base64 is deterministic', async () => {
    const a = await sha256Base64(plaintext);
    const b = await sha256Base64(plaintext);
    expect(a).toBe(b);
  });

  it('encodes and decodes the envelope', () => {
    const env: AttachmentEnvelope = {
      v: 1,
      type: 'file',
      name: 'spec.pdf',
      mime: 'application/pdf',
      size: 12345,
      path: 'chat-xyz/me/abc.enc',
      key: 'a'.repeat(44),
      sha256: 'b'.repeat(44),
    };
    const wire = encodeEnvelope(env);
    expect(wire.startsWith(ENVELOPE_PREFIX)).toBe(true);
    const parsed = tryDecodeEnvelope(wire);
    expect(parsed).toEqual(env);
  });

  it('returns null for plain text (backwards compatible fallback)', () => {
    expect(tryDecodeEnvelope('hello, world')).toBeNull();
  });

  it('returns null for malformed JSON', () => {
    expect(tryDecodeEnvelope('ccx:v1:{not json')).toBeNull();
  });

  it('returns null when required fields are missing', () => {
    expect(tryDecodeEnvelope('ccx:v1:{"name":"x.pdf"}')).toBeNull();
  });

  it('isAttachmentEnvelope only checks the prefix', () => {
    expect(isAttachmentEnvelope('ccx:v1:{}')).toBe(true);
    expect(isAttachmentEnvelope('hi')).toBe(false);
    expect(isAttachmentEnvelope('e2e:xxx')).toBe(false);
  });
});
