'use client';

import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';

/**
 * Memory-only, per-user snapshot of dashboard state for this browser tab.
 *
 * Leaving `/` for `/events` or `/e/*` unmounts the dashboard; coming back used to
 * start from empty state, show the boot loader, and refetch before painting. The
 * snapshot lets the remount paint the last known data immediately while the
 * normal loaders revalidate in the background. Nothing here is persisted: it is
 * a module-level Map (decrypted previews included, matching iOS's memory-only
 * preview cache) and is cleared on sign-out.
 */
const store = new Map<string, unknown>();

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
}

export function clearSessionCache(): void {
  store.clear();
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
