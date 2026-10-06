'use client';

import useSWR from 'swr';
import type { SessionBootstrap } from '@/lib/shell/sessionBootstrap';

export const SHELL_KEY = '/api/me/shell';

async function fetchShell(url: string): Promise<SessionBootstrap | null> {
  const res = await fetch(url, { credentials: 'same-origin', cache: 'no-store' });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`shell ${res.status}`);
  return (await res.json()) as SessionBootstrap;
}

/**
 * Shell counts. Signed-in routes pass the server bootstrap as `fallbackData`, so the first
 * paint is complete and SWR only revalidates (focus + every 60 s). Public pages pass
 * `enabled` once the client session is known.
 */
export function useShellBootstrap(fallback: SessionBootstrap | null | undefined, enabled = true) {
  const { data, mutate } = useSWR(enabled ? SHELL_KEY : null, fetchShell, {
    fallbackData: fallback ?? undefined,
    revalidateOnMount: !fallback,
    revalidateOnFocus: true,
    refreshInterval: 60_000,
    dedupingInterval: 10_000,
  });
  return { bootstrap: data ?? fallback ?? null, mutate };
}
