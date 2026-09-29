'use client';

import useSWRInfinite from 'swr/infinite';
import type { SavedHomeEvent } from '@/lib/dashboard/homeFeed';
import { fetchHomeData } from './HomeActivityRecap';

type Page = { bookmarks: SavedHomeEvent[]; next_cursor: string | null };

export function useHomeSavedEvents(userId: string) {
  const result = useSWRInfinite(
    (index: number, previous: Page | null) => {
      if (previous && !previous.next_cursor) return null;
      return ['home-saved-events', userId, index === 0 ? '' : previous!.next_cursor] as const;
    },
    ([, , cursor]) => fetchHomeData<Page>(`/api/me/event-bookmarks?limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`),
  );
  const events = [...new Map((result.data ?? []).flatMap((page) => page.bookmarks).map((e) => [e.beacon_id, e])).values()];
  return { ...result, events, hasMore: !!result.data?.at(-1)?.next_cursor };
}
