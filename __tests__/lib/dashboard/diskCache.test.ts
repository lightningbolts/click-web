import { webcrypto } from 'node:crypto';
import { TextDecoder, TextEncoder } from 'node:util';

/** Just enough IndexedDB for `diskCache`: one store per database, get/put/delete. */
function fakeIndexedDb() {
  const dbs = new Map<string, Map<string, unknown>>();
  const later = <T>(run: () => T) => {
    const req: { result?: T; error?: unknown; onsuccess?: () => void; onerror?: () => void } = {};
    queueMicrotask(() => {
      try {
        req.result = run();
        req.onsuccess?.();
      } catch (e) {
        req.error = e;
        req.onerror?.();
      }
    });
    return req;
  };
  return {
    dbs,
    open(name: string) {
      const req: { result?: unknown; onsuccess?: () => void; onupgradeneeded?: () => void; onerror?: () => void } = {};
      queueMicrotask(() => {
        const fresh = !dbs.has(name);
        if (fresh) dbs.set(name, new Map());
        const data = dbs.get(name)!;
        const store = { get: (k: string) => later(() => data.get(k)), put: (v: unknown, k: string) => later(() => data.set(k, v) && k) };
        req.result = { createObjectStore: () => store, transaction: () => ({ objectStore: () => store }), close: () => {} };
        if (fresh) req.onupgradeneeded?.();
        req.onsuccess?.();
      });
      return req;
    },
    deleteDatabase(name: string) {
      dbs.delete(name);
      return {};
    },
  };
}

let idb: ReturnType<typeof fakeIndexedDb>;
let disk: typeof import('@/lib/dashboard/diskCache');

beforeEach(() => {
  idb = fakeIndexedDb();
  Object.assign(globalThis, { indexedDB: idb, TextEncoder, TextDecoder });
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
  jest.isolateModules(() => {
    disk = require('@/lib/dashboard/diskCache');
  });
});

describe('encrypted disk snapshots', () => {
  it('round-trips dates and sets, and never stores the plaintext', async () => {
    const met = new Date('2026-05-01T12:00:00Z');
    await disk.writeDiskSnapshot('u1', {
      connections: [{ id: 'c1', dateMet: met }],
      coreIds: new Set(['c1']),
      chatMetadata: { c1: { preview: 'see you at the pier' } },
    });

    const entries = idb.dbs.get('click-session-cache')!;
    const sealed = entries.get('user:u1') as { data: ArrayBuffer };
    expect(new TextDecoder().decode(sealed.data)).not.toContain('pier');
    expect((entries.get('key') as CryptoKey).extractable).toBe(false);

    const back = await disk.readDiskSnapshot<{ connections: { dateMet: Date }[]; coreIds: Set<string>; chatMetadata: Record<string, { preview: string }> }>('u1');
    expect(back?.connections[0].dateMet).toEqual(met);
    expect(back?.coreIds).toEqual(new Set(['c1']));
    expect(back?.chatMetadata.c1.preview).toBe('see you at the pier');
    expect(await disk.readDiskSnapshot('u2')).toBeNull();
  });

  it('reads nothing once signed out, and a write in flight at sign-out does not land', async () => {
    await disk.writeDiskSnapshot('u1', { a: 1 });
    disk.clearDiskSnapshots();
    expect(await disk.readDiskSnapshot('u1')).toBeNull();

    const write = disk.writeDiskSnapshot('u1', { a: 2 });
    disk.clearDiskSnapshots();
    await write;
    expect(idb.dbs.get('click-session-cache')?.get('user:u1')).toBeUndefined();
  });

  it('treats unavailable storage as no snapshot', async () => {
    Object.assign(globalThis, { indexedDB: undefined });
    await expect(disk.writeDiskSnapshot('u1', { a: 1 })).resolves.toBeUndefined();
    await expect(disk.readDiskSnapshot('u1')).resolves.toBeNull();
  });
});
