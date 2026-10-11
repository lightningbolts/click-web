/** @jest-environment node */
import { generateDeviceIdentity, generateEpochKey, wrapEpochKey } from '@/lib/chat/e2eeV2';
import {
  clearWebE2eeV2SessionCaches,
  loadOrCreateWebE2eeV2Identity,
  resolveWebE2eeV2Session,
} from '@/lib/chat/e2eeV2Client';

const originalFetch = global.fetch;
const auth = async () => ({ Authorization: 'Bearer test' });
const chatId = 'chat-test';
let identity: Awaited<ReturnType<typeof loadOrCreateWebE2eeV2Identity>>;

beforeEach(async () => {
  clearWebE2eeV2SessionCaches();
  const stored = await generateDeviceIdentity();
  // IndexedDB fixture retains a non-extractable key, just like the browser identity store.
  Object.defineProperty(global, 'indexedDB', { configurable: true, value: {
    open: () => {
      const request: Record<string, unknown> = {};
      const db = { close: jest.fn(), transaction: () => {
        const transaction: Record<string, unknown> = {};
        transaction.objectStore = () => ({ get: () => {
          const read: Record<string, unknown> = { result: stored };
          queueMicrotask(() => {
            (read.onsuccess as (() => void) | undefined)?.();
            (transaction.oncomplete as () => void)();
          });
          return read;
        } });
        return transaction;
      } };
      queueMicrotask(() => { request.result = db; (request.onsuccess as () => void)(); });
      return request;
    },
  } });
  identity = await loadOrCreateWebE2eeV2Identity();
});
afterEach(() => { global.fetch = originalFetch; Reflect.deleteProperty(global, 'indexedDB'); });

test('a send right after the thread opened re-checks devices and rotates when they changed', async () => {
  const peer = await generateDeviceIdentity();
  const devices = [
    { id: 'own-row', user_id: 'user-1', device_id: identity.deviceId, identity_public_key: identity.publicKeySpkiBase64,
      key_algorithm: 'X25519', crypto_version: 2 },
    { id: 'peer-row', user_id: 'user-2', device_id: 'b'.repeat(64), identity_public_key: peer.publicKeySpkiBase64,
      key_algorithm: 'X25519', crypto_version: 2 },
  ];
  // Epoch 1 was wrapped for this device alone; the peer's device registered since.
  const wrap = await wrapEpochKey({ chatId, epoch: 1, senderDeviceId: identity.deviceId, recipientDeviceId: identity.deviceId,
    epochKey: generateEpochKey(), recipientPublicKey: identity.publicKey });
  let state = { chat_id: chatId, device_id: identity.deviceId, current_epoch: 1, membership_fingerprint: 'before-the-peer-joined',
    envelopes: [{ chat_id: chatId, epoch: 1, sender_device_id: identity.deviceId, recipient_device_id: 'own-row', envelope: wrap }] };
  global.fetch = jest.fn(async (input, init) => {
    const url = String(input);
    if (url === '/api/chat/devices' && init?.method === 'POST') return Response.json({ device: devices[0] });
    if (url.startsWith('/api/chat/devices?')) return Response.json({ devices });
    if (url.startsWith('/api/chat/epochs?')) return Response.json(state);
    if (url === '/api/chat/epochs' && init?.method === 'POST') {
      const body = JSON.parse(String(init.body)) as { epoch: number; membership_fingerprint: string;
        envelopes: { recipient_device_id: string; envelope: string }[] };
      const mine = body.envelopes.find((row) => row.recipient_device_id === identity.deviceId)!;
      state = { ...state, current_epoch: body.epoch, membership_fingerprint: body.membership_fingerprint,
        envelopes: [{ ...state.envelopes[0], epoch: body.epoch, envelope: mine.envelope }] };
      return Response.json({ epoch: {} }, { status: 201 });
    }
    throw new Error(`Unexpected request: ${url}`);
  });
  const resolve = (allowUpgrade: boolean) =>
    resolveWebE2eeV2Session({ chatId, participantUserIds: ['user-1', 'user-2'], getAuthHeaders: auth, allowUpgrade });

  // Opening the thread resolves for reading only: that must not vouch for a send.
  await expect(resolve(false)).resolves.toMatchObject({ currentEpoch: 1 });
  await expect(resolve(true)).resolves.toMatchObject({ currentEpoch: 2 });
  expect(global.fetch).toHaveBeenCalledWith('/api/chat/epochs', expect.objectContaining({ method: 'POST' }));
});
