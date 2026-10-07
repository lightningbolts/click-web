'use client';

import { useEffect } from 'react';
import { mutate } from 'swr';
import { ACTIVITY_KEY, refreshActivity } from '@/components/activity/activityData';
import { getSupabaseClient } from '@/lib/supabase';

/** Bursts (a backfill, several reactions at once) become one refetch. */
const COALESCE_MS = 600;

/**
 * Keeps the bell, the popover, the Activity page and Home's rail current: listens on the
 * viewer's private `user:<id>` topic (`live_updates` migration, the same one iOS joins) and
 * refetches when an `activity` hint arrives. Hints carry no content; reads stay on the API.
 * A rejoin after a dropped socket catches up, since hints sent meanwhile were missed.
 */
export function LiveActivity({ viewerId }: { viewerId: string }) {
  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    const refreshSoon = () => {
      timer ??= setTimeout(() => {
        timer = null;
        void refreshActivity();
      }, COALESCE_MS);
    };

    let cancelled = false;
    let joined = false;
    const channel = supabase
      .channel(`user:${viewerId}`, { config: { private: true } })
      .on('broadcast', { event: 'changed' }, ({ payload }) => {
        if ((payload as { kind?: unknown } | undefined)?.kind === 'activity') refreshSoon();
      });
    // Private topics are authorized by the viewer's token, so it must be on the socket first.
    void supabase.realtime.setAuth().then(() => {
      if (cancelled) return;
      channel.subscribe((status) => {
        if (status !== 'SUBSCRIBED') return;
        if (joined) refreshSoon();
        joined = true;
      });
    });

    // A background tab's socket can sleep through hints; on return, re-read what's on screen
    // (the shell's dot already revalidates on focus).
    const onVisible = () => {
      if (document.visibilityState === 'visible') void mutate(ACTIVITY_KEY);
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
      void supabase.removeChannel(channel);
    };
  }, [viewerId]);

  return null;
}
