/** @jest-environment node */
import { generateDeviceIdentity, generateEpochKey, wrapEpochKey } from '@/lib/chat/e2eeV2';
import { loadOrCreateWebE2eeV2Identity, resolveWebHubE2eeV2Session } from '@/lib/chat/e2eeV2Client';

const originalFetch = global.fetch;
const auth = async () => ({ Authorization: 'Bearer test' });
let identity: Awaited<ReturnType<typeof loadOrCreateWebE2eeV2Identity>>;

beforeEach(async () => {
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

function server(state: Record<string, unknown>, devices = [{
  id: 'device-row-id', user_id: 'user-1', device_id: identity.deviceId,
  identity_public_key: identity.publicKeySpkiBase64, key_algorithm: 'X25519', crypto_version: 2,
}]) {
  global.fetch = jest.fn(async (input, init) => {
    const url = String(input);
    if (url === '/api/chat/devices' && init?.method === 'POST') return Response.json({ device: devices[0] });
    if (url.startsWith('/api/hub/devices?')) return Response.json({ devices });
    if (url.startsWith('/api/hub/epochs?')) return Response.json(state);
    throw new Error(`Unexpected request: ${url}`);
  });
}

test('reads hub envelopes using row-id recipients and the shared mobile wire format', async () => {
  const key = generateEpochKey();
  const fingerprint = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`user-1:${identity.deviceId}`))).toString('hex');
  const envelope = await wrapEpochKey({ chatId: 'hub-test', epoch: 1, senderDeviceId: identity.deviceId, recipientDeviceId: identity.deviceId, epochKey: key, recipientPublicKey: identity.publicKey });
  server({ hub_id: 'hub-test', device_id: identity.deviceId, current_epoch: 1, membership_fingerprint: fingerprint,
    envelopes: [{ hub_id: 'hub-test', epoch: 1, sender_device_id: identity.deviceId, recipient_device_id: 'device-row-id', envelope }] });
  const session = await resolveWebHubE2eeV2Session({ hubId: 'hub-test', participantUserIds: ['user-1'], getAuthHeaders: auth });
  expect(session?.epochKeys.get(1)).toEqual(key);
  session?.epochKeys.forEach((bytes) => bytes.fill(0));
});

test('does not upgrade a legacy hub until every participant has a device', async () => {
  server({ hub_id: 'hub-test', device_id: identity.deviceId, current_epoch: null, envelopes: [] });
  await expect(resolveWebHubE2eeV2Session({ hubId: 'hub-test', participantUserIds: ['user-1', 'user-2'], getAuthHeaders: auth })).resolves.toBeNull();
  expect(global.fetch).not.toHaveBeenCalledWith('/api/hub/epochs', expect.objectContaining({ method: 'POST' }));
});

test('fails closed for an upgraded hub without a key envelope for this device', async () => {
  const fingerprint = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`user-1:${identity.deviceId}`))).toString('hex');
  server({ hub_id: 'hub-test', device_id: identity.deviceId, current_epoch: 1, membership_fingerprint: fingerprint, envelopes: [] });
  await expect(resolveWebHubE2eeV2Session({ hubId: 'hub-test', participantUserIds: ['user-1'], getAuthHeaders: auth })).rejects.toThrow('not approved');
});
