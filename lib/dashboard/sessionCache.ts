'use client';

import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { clearDiskSnapshots, readDiskSnapshot, writeDiskSnapshot } from './diskCache';

/**
 * Per-user snapshot of dashboard state for this browser tab.
 *
 * Leaving `/` for `/events` or `/e/*` unmounts the dashboard; coming back used to
 * start from empty state, show the boot loader, and refetch before painting. The
 * snapshot lets the remount paint the last known data immediately while the
 * normal loaders revalidate in the background. It is a module-level Map, cleared
 * on sign-out.
 *
 * The Clicks inbox and Map keys (`PERSISTED`, pins included) also survive a reload: they are
 * written through, debounced, to an encrypted IndexedDB snapshot (`diskCache`,
 * decrypted previews included, never stored in the clear) and read back once per
 * page load by `useSessionCacheHydrated` before those screens mount.
 */
const store = new Map<string, unknown>();

const PERSISTED = new Set([
  'connections',
  'mapConnections',
  'archivedIds',
  'coreIds',
  'connectionsLoaded',
  'groupCliques',
  'groupCliquesLoaded',
  'verifiedClickMemberSetKeys',
  'chatMetadata',
  'directPreviewsLoaded',
  'groupPreviewsLoaded',
  'mapBeacons',
  'mapBeaconsLoaded',
  'mapPlaces',
  'mapPlacesLoaded',
]);
const PERSIST_DEBOUNCE_MS = 400;

function cacheKey(userId: string, key: string): string {
  return `${userId}:${key}`;
}

export function readSessionCache<T>(userId: string | null | undefined, key: string): T | undefined {
  if (!userId) return undefined;
  return store.get(cacheKey(userId, key)) as T | undefined;
}

export function writeSessionCache<T>(userId: string | null | undefined, key: string, value: T): void {
  if (!userId) return;
  store.set(cacheKey(userId, key), value);
  if (PERSISTED.has(key)) schedulePersist(userId);
}

/* ── Persistence ─────────────────────────────────────────────────────────── */

const hydration = new Map<string, Promise<void>>();
const hydrated = new Set<string>();
const persistTimers = new Map<string, ReturnType<typeof setTimeout>>();

function persistNow(userId: string): void {
  const timer = persistTimers.get(userId);
  if (timer) clearTimeout(timer);
  persistTimers.delete(userId);
  const snapshot: Record<string, unknown> = {};
  for (const key of PERSISTED) {
    const value = store.get(cacheKey(userId, key));
    if (value !== undefined) snapshot[key] = value;
  }
  void writeDiskSnapshot(userId, snapshot);
}

let flushOnHide = false;
function schedulePersist(userId: string): void {
  // Until the disk snapshot is read back, a write would replace it with a partial one.
  if (!hydrated.has(userId) || typeof window === 'undefined') return;
  const timer = persistTimers.get(userId);
  if (timer) clearTimeout(timer);
  persistTimers.set(userId, setTimeout(() => persistNow(userId), PERSIST_DEBOUNCE_MS));
  if (!flushOnHide) {
    flushOnHide = true;
    window.addEventListener('pagehide', () => [...persistTimers.keys()].forEach(persistNow));
  }
}

/** Reads the user's disk snapshot into memory once per page load; keys already in memory win. */
function hydrateSessionCache(userId: string): Promise<void> {
  let pending = hydration.get(userId);
  if (!pending) {
    pending = readDiskSnapshot<Record<string, unknown>>(userId).then((snapshot) => {
      for (const [key, value] of Object.entries(snapshot ?? {})) {
        if (PERSISTED.has(key) && !store.has(cacheKey(userId, key))) store.set(cacheKey(userId, key), value);
      }
      hydrated.add(userId);
    });
    hydration.set(userId, pending);
  }
  return pending;
}

/**
 * False until this user's disk snapshot is in memory. Screens that seed state from `PERSISTED`
 * keys mount their data hooks only once it's true, so the first paint is the last known data.
 * Already true on in-app navigation; on a reload it takes one IndexedDB read.
 */
export function useSessionCacheHydrated(userId: string | null | undefined): boolean {
  const [readyFor, setReadyFor] = useState(() => (userId && hydrated.has(userId) ? userId : null));
  useEffect(() => {
    if (!userId || readyFor === userId) return;
    let live = true;
    void hydrateSessionCache(userId).then(() => {
      if (live) setReadyFor(userId);
    });
    return () => {
      live = false;
    };
  }, [readyFor, userId]);
  return !userId || readyFor === userId;
}

export function clearSessionCache(): void {
  store.clear();
  for (const timer of persistTimers.values()) clearTimeout(timer);
  persistTimers.clear();
  hydration.clear();
  hydrated.clear();
  clearDiskSnapshots();
}

/**
 * `useState` seeded from (and written back to) the session cache. Use for state
 * whose last value is a better first paint than an empty default.
 */
export function useSessionCachedState<T>(
  userId: string | null | undefined,
  key: string,
  initial: T | (() => T),
): [T, Dispatch<SetStateAction<T>>] {
  const [state, setState] = useState<T>(() => {
    const cached = readSessionCache<T>(userId, key);
    if (cached !== undefined) return cached;
    return typeof initial === 'function' ? (initial as () => T)() : initial;
  });

  useEffect(() => {
    writeSessionCache(userId, key, state);
  }, [userId, key, state]);

  return [state, setState];
}
