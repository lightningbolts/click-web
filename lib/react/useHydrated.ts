'use client';

import { useSyncExternalStore } from 'react';

const noopSubscribe = () => () => {};

/**
 * False while React hydrates this component (server snapshot), true afterwards.
 *
 * Components inside a `<Suspense>` boundary can hydrate after providers above them have
 * already updated (auth resolved, theme applied). Rendering from live context during that
 * late hydration produces markup the server never sent, so React discards and re-renders the
 * subtree: a visible flash. Gate such output on `useHydrated()` and render the server
 * snapshot until it is true.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}
