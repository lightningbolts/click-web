'use client';

import useSWR, { mutate } from 'swr';
import { authedJson } from '@/lib/api/authedJson';
import { SHELL_KEY } from '@/lib/shell/useShellBootstrap';
import type { ActivityRowItem } from './ActivityRow';

export type ActivityPage = {
  items: ActivityRowItem[];
  seen_at: string | null;
  next_before: string | null;
  pending_requests: string[];
};

/** The latest page: one cache for the bell's popover, the Activity page and Home's rail. */
export const ACTIVITY_KEY = '/api/activity';

export const fetchActivityPage = (url: string) => authedJson<ActivityPage>(url);

/**
 * The latest page, kept current by `LiveActivity`. A server-rendered page passes its own copy, so
 * it paints at once without refetching it.
 */
export function useLatestActivity(rendered?: ActivityPage) {
  return useSWR(ACTIVITY_KEY, fetchActivityPage, {
    fallbackData: rendered,
    revalidateOnMount: !rendered,
    revalidateOnFocus: false,
  });
}

let reading: Promise<unknown> | null = null;

/**
 * Starts reading the latest page before the popover opens (hover, focus), into the cache the
 * popover shows at once. Only when nothing is cached yet: a cached page is kept current by
 * `LiveActivity`, and the popover revalidates it on open either way.
 */
export function preloadActivity(): void {
  reading ??= mutate<ActivityPage>(ACTIVITY_KEY, (cached) => cached ?? fetchActivityPage(ACTIVITY_KEY), { revalidate: false })
    .catch(() => undefined)
    .finally(() => {
      reading = null;
    });
}

/** Refetches what shows activity: the latest page (where it's on screen) and the bell's dot. */
export function refreshActivity(): Promise<unknown> {
  return Promise.all([mutate(ACTIVITY_KEY), mutate(SHELL_KEY)]);
}

/** Tells the server the newest item was seen, then clears the dot (never throws). */
export async function markSeen(items: readonly { created_at: string }[]): Promise<void> {
  const newest = items[0]?.created_at;
  if (!newest) return;
  try {
    await authedJson('/api/activity/seen', { method: 'POST', body: { seen_at: newest } });
  } catch {
    return;
  }
  await refreshActivity();
}
