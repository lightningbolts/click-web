'use client';

import dynamic from 'next/dynamic';
import { usePathname, useSearchParams } from 'next/navigation';
import { useCallback, useState } from 'react';
import { Skeleton } from '@/components/ds/Skeleton';
import { useAuth } from '@/lib/AuthContext';
import { readSessionCache } from '@/lib/dashboard/sessionCache';
import { dashboardTabForPath } from '@/lib/shell/personalProductNav';

/** Keep livekit/maplibre/emoji-mart out of the Worker SSR bundle. */
const DashboardView = dynamic(() => import('@/components/DashboardView'), { ssr: false, loading: () => null });

/**
 * Transitional host (spec §13 phase 1): the legacy panes live in the `(app)` layout so map and
 * chat stay mounted while moving between `/clicks`, `/map`, `/add` and `/settings`. Phase 2
 * replaces each pane with its own route page.
 */
export function LegacyDashboardHost() {
  const pathname = usePathname();
  const filter = useSearchParams().get('filter');
  const { user } = useAuth();
  const tab = dashboardTabForPath(pathname, filter);
  const [ready, setReady] = useState(() => (user ? readSessionCache<boolean>(user.id, 'booted') === true : false));
  const onReady = useCallback(() => setReady(true), []);

  if (!tab || !user) return null;
  return (
    <>
      {ready ? null : (
        <div aria-busy className="mx-auto w-full max-w-[1280px] px-[var(--gutter)] py-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="mt-6 h-64 w-full" rounded="lg" shimmer />
        </div>
      )}
      <DashboardView user={user} routeTab={tab} onReady={onReady} />
    </>
  );
}
