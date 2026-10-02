/** @jest-environment node */
import { createHash, createCipheriv, createHmac } from 'node:crypto';
import { deriveKeysForHub, decryptMediaBytes } from '@/lib/chat/crypto';

test('opens the mobile legacy hub AES-CBC/HMAC envelope and rejects another hub', async () => {
  const hash = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest();
  const master = hash('click-platforms-e2ee-v1-2024:hub-broadcast:hub-a');
  const encKey = hash(Buffer.concat([master, Buffer.from([1])]));
  const macKey = hash(Buffer.concat([master, Buffer.from([2])]));
  const iv = Buffer.alloc(16, 7);
  const cipher = createCipheriv('aes-256-cbc', encKey, iv);
  const ciphertext = Buffer.concat([cipher.update('mobile image bytes'), cipher.final()]);
  const mac = createHmac('sha256', macKey).update(Buffer.concat([iv, ciphertext])).digest();
  const payload = new Uint8Array(Buffer.concat([iv, mac, ciphertext]));
  const keys = await deriveKeysForHub('hub-a');
  expect(Buffer.from(await decryptMediaBytes(payload, keys)).toString()).toBe('mobile image bytes');
  await expect(decryptMediaBytes(payload, await deriveKeysForHub('hub-b'))).rejects.toThrow();
});
