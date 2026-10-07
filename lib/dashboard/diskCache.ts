'use client';

/**
 * Encrypted, per-user snapshots in IndexedDB, so a reload paints the last known Clicks inbox and
 * Map at once instead of starting empty.
 *
 * Snapshots hold decrypted chat previews, so they are never stored in the clear: each is sealed
 * with AES-GCM under a non-extractable key generated in this browser and kept in the same
 * database (the E2EE identity key is stored the same way, see `lib/chat/e2eeV2Client.ts`). The
 * database is deleted on sign-out. Every failure (private mode, quota, a corrupt or foreign
 * entry) reads as "no snapshot"; nothing here ever throws to callers.
 */

const DB_NAME = 'click-session-cache';
const STORE = 'entries';
const KEY_ID = 'key';
/** Older snapshots are dropped rather than painted. */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
/** Storage that doesn't answer in time is treated as unavailable, so first paint never waits on it. */
const OPEN_TIMEOUT_MS = 800;

type Sealed = { savedAt: number; iv: Uint8Array<ArrayBuffer>; data: ArrayBuffer };

/** Bumped on sign-out: a write that started before it must not recreate the database after it. */
let generation = 0;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (v) => {
        clearTimeout(id);
        resolve(v);
      },
      (e) => {
        clearTimeout(id);
        reject(e);
      },
    );
  });
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined' || typeof crypto === 'undefined' || !crypto.subtle) {
    return Promise.reject(new Error('unavailable'));
  }
  const req = indexedDB.open(DB_NAME, 1);
  req.onupgradeneeded = () => req.result.createObjectStore(STORE);
  return withTimeout(request(req), OPEN_TIMEOUT_MS);
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => Promise<T>): Promise<T> {
  const db = await openDb();
  try {
    return await run(db.transaction(STORE, mode).objectStore(STORE));
  } finally {
    db.close();
  }
}

/** This browser's sealing key; created on first write (`live` false: signed out meanwhile). */
async function sealingKey(live?: () => boolean): Promise<CryptoKey | null> {
  const stored = await withStore('readonly', (s) => request(s.get(KEY_ID) as IDBRequest<CryptoKey | undefined>));
  if (stored) return stored;
  if (!live) return null;
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  if (!live()) return null;
  await withStore('readwrite', (s) => request(s.put(key, KEY_ID)));
  return key;
}

/** JSON that keeps `Date` and `Set` values (connection dates, id sets). */
function encode(value: unknown): string {
  return JSON.stringify(value, function (this: Record<string, unknown>, k, v) {
    const raw = this[k];
    if (raw instanceof Date) return { $date: raw.getTime() };
    if (raw instanceof Set) return { $set: [...raw] };
    return v;
  });
}

function decode(text: string): unknown {
  return JSON.parse(text, (_k, v) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      if (typeof v.$date === 'number') return new Date(v.$date);
      if (Array.isArray(v.$set)) return new Set(v.$set);
    }
    return v;
  });
}

export async function readDiskSnapshot<T>(userId: string): Promise<T | null> {
  try {
    const key = await sealingKey();
    if (!key) return null;
    const sealed = await withStore('readonly', (s) => request(s.get(`user:${userId}`) as IDBRequest<Sealed | undefined>));
    if (!sealed || Date.now() - sealed.savedAt > MAX_AGE_MS) return null;
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: sealed.iv }, key, sealed.data);
    return decode(new TextDecoder().decode(plain)) as T;
  } catch {
    return null;
  }
}

export async function writeDiskSnapshot(userId: string, value: unknown): Promise<void> {
  const started = generation;
  const live = () => started === generation;
  try {
    const key = await sealingKey(live);
    if (!key) return;
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(encode(value)));
    const sealed: Sealed = { savedAt: Date.now(), iv, data };
    // Checked in the same tick that opens the database, so a sign-out can't slip in between.
    if (!live()) return;
    await withStore('readwrite', (s) => request(s.put(sealed, `user:${userId}`)));
  } catch {
    /* best effort: the next load simply fetches */
  }
}

/** Sign-out: the snapshots and their key go together. */
export function clearDiskSnapshots(): void {
  generation += 1;
  try {
    if (typeof indexedDB !== 'undefined') indexedDB.deleteDatabase(DB_NAME);
  } catch {
    /* ignore */
  }
}
