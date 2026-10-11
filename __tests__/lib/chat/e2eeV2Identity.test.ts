/**
 * One browser, one E2EE device identity. Concurrent first-visit callers (and two tabs) used to
 * each mint and register their own, so the account saw several "new sign-ins" from one browser.
 */

type Store = Map<string, unknown>;

const holdsX25519Key = (value: unknown) =>
  Object.values(value as object).some((field) => (field as CryptoKey | null)?.algorithm?.name === 'X25519');

/**
 * Minimal async IndexedDB: one shared store, readwrite transactions run one at a time (as real
 * IndexedDB does across tabs), callbacks fire on later ticks. `safari` reads a record holding an
 * X25519 CryptoKey back as null, as Safari does.
 */
function fakeIndexedDb({ safari = false } = {}) {
  const store: Store = new Map();
  let queue = Promise.resolve();
  const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

  function transaction(mode: 'readonly' | 'readwrite') {
    const tx: Record<string, unknown> & { oncomplete?: () => void; onerror?: () => void; onabort?: () => void } = {};
    const ops: Array<() => Promise<void>> = [];
    const objectStore = {
      get(key: string) {
        const request: { result?: unknown; onsuccess?: () => void } = {};
        ops.push(async () => {
          await tick();
          const value = store.get(key);
          request.result = safari && value && holdsX25519Key(value) ? null : value;
          request.onsuccess?.();
        });
        return request;
      },
      put(value: unknown, key: string) {
        ops.push(async () => {
          await tick();
          store.set(key, value);
        });
        return {};
      },
      delete(key: string) {
        ops.push(async () => {
          await tick();
          store.delete(key);
        });
        return {};
      },
    };
    const run = async () => {
      await tick();
      while (ops.length) await ops.shift()!();
      tx.oncomplete?.();
    };
    if (mode === 'readwrite') queue = queue.then(run);
    else void run();
    tx.objectStore = () => objectStore;
    return tx;
  }

  return {
    store,
    factory: {
      open() {
        const request: { result?: unknown; onsuccess?: () => void } = {};
        setTimeout(() => {
          request.result = { transaction: (_: string, mode: 'readonly' | 'readwrite') => transaction(mode), close() {} };
          request.onsuccess?.();
        }, 0);
        return request;
      },
    },
  };
}

type Client = typeof import('@/lib/chat/e2eeV2Client');

/** A fresh copy of the client module: one browser tab. */
function loadTab(): Client {
  let client!: Client;
  jest.isolateModules(() => {
    client = jest.requireActual('@/lib/chat/e2eeV2Client');
  });
  return client;
}

describe('loadOrCreateWebE2eeV2Identity', () => {
  let db: ReturnType<typeof fakeIndexedDb>;

  beforeEach(() => {
    db = fakeIndexedDb();
    Object.defineProperty(globalThis, 'indexedDB', { value: db.factory, configurable: true });
  });

  it('gives concurrent first-visit callers one identity', async () => {
    const tab = loadTab();
    const ids = await Promise.all(Array.from({ length: 6 }, () => tab.loadOrCreateWebE2eeV2Identity()));
    expect(new Set(ids.map((identity) => identity.deviceId)).size).toBe(1);
    expect(db.store.size).toBe(1);
  });

  it('gives two tabs opened at once the same identity', async () => {
    const [a, b] = await Promise.all([loadTab().loadOrCreateWebE2eeV2Identity(), loadTab().loadOrCreateWebE2eeV2Identity()]);
    expect(a.deviceId).toBe(b.deviceId);
  });

  it('keeps the stored identity on later visits', async () => {
    const first = await loadTab().loadOrCreateWebE2eeV2Identity();
    const later = await loadTab().loadOrCreateWebE2eeV2Identity();
    expect(later.deviceId).toBe(first.deviceId);
  });

  it('keeps one identity for the page even when storage loses it', async () => {
    const tab = loadTab();
    const first = await tab.loadOrCreateWebE2eeV2Identity();
    db.store.clear();
    expect((await tab.loadOrCreateWebE2eeV2Identity()).deviceId).toBe(first.deviceId);
  });

  it('keeps the identity in Safari, which reads stored X25519 keys back as null', async () => {
    db = fakeIndexedDb({ safari: true });
    Object.defineProperty(globalThis, 'indexedDB', { value: db.factory, configurable: true });
    const first = await loadTab().loadOrCreateWebE2eeV2Identity();
    const [a, b] = await Promise.all([loadTab().loadOrCreateWebE2eeV2Identity(), loadTab().loadOrCreateWebE2eeV2Identity()]);
    expect([a.deviceId, b.deviceId]).toEqual([first.deviceId, first.deviceId]);
    expect(first.privateKey.extractable).toBe(false);
  });

  describe('a browser removed from the account', () => {
    const originalFetch = global.fetch;
    afterEach(() => {
      global.fetch = originalFetch;
    });

    it('starts over as a new device', async () => {
      const tab = loadTab();
      const removed = await tab.loadOrCreateWebE2eeV2Identity();
      const registered: string[] = [];
      global.fetch = jest.fn(async (_url: unknown, init?: RequestInit) => {
        const { device_id: deviceId } = JSON.parse(String(init?.body)) as { device_id: string };
        registered.push(deviceId);
        const body = deviceId === removed.deviceId
          ? { error: 'This device was removed from your account', code: 'DEVICE_REVOKED' }
          : { device: {} };
        return { ok: !('error' in body), status: 'error' in body ? 409 : 200, json: async () => body };
      }) as unknown as typeof fetch;

      await tab.registerWebE2eeV2Device(async () => ({}));

      const fresh = await tab.loadOrCreateWebE2eeV2Identity();
      expect(fresh.deviceId).not.toBe(removed.deviceId);
      expect(registered).toEqual([removed.deviceId, fresh.deviceId]);
      expect((await loadTab().loadOrCreateWebE2eeV2Identity()).deviceId).toBe(fresh.deviceId);
    });

    it('makes one new key per attempt when the server turns that away too', async () => {
      const tab = loadTab();
      const registered: string[] = [];
      global.fetch = jest.fn(async (_url: unknown, init?: RequestInit) => {
        registered.push((JSON.parse(String(init?.body)) as { device_id: string }).device_id);
        return { ok: false, status: 409, json: async () => ({ error: 'This device was removed from your account', code: 'DEVICE_REVOKED' }) };
      }) as unknown as typeof fetch;

      await expect(tab.registerWebE2eeV2Device(async () => ({}))).rejects.toMatchObject({ reason: 'DEVICE_REVOKED' });
      expect(registered).toHaveLength(2);
    });
  });
});
