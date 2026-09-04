/** @jest-environment node */

import vector from '@/docs/security/e2ee-v2-golden-vector.json';
import { decryptMessage, E2EE_V2_PREFIX } from '@/lib/chat/e2eeV2';

function envelopeWire(): string {
  const value = {
    v: vector.version,
    type: 'message',
    chatId: '11111111-1111-4111-8111-111111111111',
    epoch: 7,
    senderDeviceId: 'sender-device-01',
    cryptoVersion: vector.version,
    clientMessageId: '22222222-2222-4222-8222-222222222222',
    nonce: vector.nonce_base64,
    ciphertext: vector.ciphertext_base64,
  };
  return E2EE_V2_PREFIX + Buffer.from(JSON.stringify(value), 'utf8').toString('base64');
}

describe('E2EE v2 shared golden vector', () => {
  it('decrypts the protocol fixture used by mobile and web', async () => {
    const key = Uint8Array.from(Buffer.from(vector.key_base64, 'base64'));
    await expect(decryptMessage({
      chatId: '11111111-1111-4111-8111-111111111111',
      epoch: 7,
      senderDeviceId: 'sender-device-01',
      clientMessageId: '22222222-2222-4222-8222-222222222222',
      epochKey: key,
      envelope: envelopeWire(),
    })).resolves.toBe(vector.plaintext);
  });
});
