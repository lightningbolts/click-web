'use client';

import { useEffect } from 'react';

type WakeLockSentinel = { release: () => Promise<void> };
type WakeLockApi = { request: (type: 'screen') => Promise<WakeLockSentinel> };

/**
 * Keeps the screen on while `active` (a code someone is about to scan, the door scanner). The
 * browser drops the lock whenever the tab is hidden, so it's taken again when it comes back.
 * Where the Screen Wake Lock API is missing, this does nothing.
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    const api = (navigator as Navigator & { wakeLock?: WakeLockApi }).wakeLock;
    if (!active || !api) return;
    let lock: WakeLockSentinel | null = null;
    let done = false;
    const acquire = () => {
      if (document.visibilityState !== 'visible') return;
      api.request('screen').then(
        (sentinel) => {
          if (done) void sentinel.release().catch(() => {});
          else lock = sentinel;
        },
        () => {},
      );
    };
    acquire();
    document.addEventListener('visibilitychange', acquire);
    return () => {
      done = true;
      document.removeEventListener('visibilitychange', acquire);
      void lock?.release().catch(() => {});
    };
  }, [active]);
}
