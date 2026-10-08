/** @jest-environment node */
import {
  decryptHistoryManifest, deriveWrappingKey, encryptHistoryManifest,
  generateBackupKey, unwrapBackupKey, wrapBackupKey,
} from '@/lib/chat/keyRecoveryCrypto';

describe('zero-knowledge history recovery crypto', () => {
  const userId = '11111111-1111-4111-8111-111111111111';
  const manifest = {
    version: 1 as const,
    userId,
    keys: [{ scope: 'chat' as const, id: 'thread-1', epoch: 1, key: Buffer.alloc(32, 7).toString('base64') }],
  };

  it('round-trips a client-encrypted history manifest and a credential-wrapped backup key', async () => {
    const backupKey = generateBackupKey();
    const wrapKey = await deriveWrappingKey(new Uint8Array(32).fill(9));
    const wrapped = await wrapBackupKey(wrapKey, backupKey, userId);
    const recovered = await unwrapBackupKey(wrapKey, wrapped, userId);
    expect(recovered).toEqual(backupKey);
    const encrypted = await encryptHistoryManifest(backupKey, manifest);
    await expect(decryptHistoryManifest(recovered, encrypted, userId)).resolves.toEqual(manifest);
    expect(JSON.stringify(encrypted)).not.toContain(manifest.keys[0].key);
  });

  it('fails closed for the wrong account, wrong key, tampering and wrong credential', async () => {
    const backupKey = generateBackupKey();
    const ciphertext = await encryptHistoryManifest(backupKey, manifest);
    await expect(decryptHistoryManifest(backupKey, ciphertext, 'attacker')).rejects.toThrow();
    await expect(decryptHistoryManifest(generateBackupKey(), ciphertext, userId)).rejects.toThrow();
    const other = { ...ciphertext, ciphertext: ciphertext.ciphertext.slice(0, -4) + 'AAAA' };
    await expect(decryptHistoryManifest(backupKey, other, userId)).rejects.toThrow();
    const wrapped = await wrapBackupKey(new Uint8Array(32).fill(1), backupKey, userId);
    await expect(unwrapBackupKey(new Uint8Array(32).fill(2), wrapped, userId)).rejects.toThrow();
  });

  it('rejects incorrect epoch key sizes and arbitrary recovery secret lengths', async () => {
    const backupKey = generateBackupKey();
    await expect(encryptHistoryManifest(backupKey, {
      ...manifest, keys: [{ ...manifest.keys[0], key: Buffer.alloc(12).toString('base64') }],
    })).rejects.toThrow();
    await expect(deriveWrappingKey(new Uint8Array(16))).rejects.toThrow();
  });
});
