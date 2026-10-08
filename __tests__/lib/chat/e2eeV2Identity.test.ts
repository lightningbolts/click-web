/**
 * One browser, one E2EE device identity. Concurrent first-visit callers (and two tabs) used to
 * each mint and register their own, so the account saw several "new sign-ins" from one browser.
 */

type Store = Map<string, unknown>;

/**
 * Minimal async IndexedDB: one shared store, readwrite transactions run one at a time (as real
 * IndexedDB does across tabs), callbacks fire on later ticks.
 */
function fakeIndexedDb() {
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
          request.result = store.get(key);
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
});
