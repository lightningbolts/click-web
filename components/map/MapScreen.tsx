'use client';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { Loader } from '@/components/ds/Loader';
import type { ConnectionRecord } from '@/components/dashboard/ConnectionTable';
import { useConnectionsData } from '@/components/dashboard/useConnectionsData';
import { useAuth } from '@/lib/AuthContext';
import { getFreshAuthHeaders } from '@/lib/auth/freshAuthHeaders';
import type { InboxPreload } from '@/lib/clicks/inboxPreload';
import { useSessionCacheHydrated, useSessionCachedState } from '@/lib/dashboard/sessionCache';
import { personHref, threadHref } from '@/lib/shell/appNav';

function MapLoading() {
  return (
    <div className="flex flex-1 items-center justify-center bg-surface-raised">
      <Loader size={44} label="Loading map" />
    </div>
  );
}

// MapLibre loads on this route only (spec §11.2).
const ConnectionMap = dynamic(() => import('@/components/map/ConnectionMap'), { ssr: false, loading: MapLoading });

/**
 * `/map` (spec §7.5): fills the top bar's frame. Loads the viewer's connections (with where they
 * met; the first load starts on the server, see `map/page.tsx`) and hands them to the map; events
 * and Places load from the map's own viewport.
 */
export function MapScreen({ preload }: { preload?: Promise<InboxPreload | null> }) {
  const { user } = useAuth();
  // Connections seed from the last visit (memory, or after a reload the encrypted disk snapshot).
  const hydrated = useSessionCacheHydrated(user?.id);
  return (
    <div data-testid="map-screen" className="flex h-[calc(100dvh-var(--topbar-height)-var(--tabbar-height))] min-h-0 flex-col overflow-hidden border-hairline md:container-frame md:border-x">
      <h1 className="sr-only">Map</h1>
      {hydrated ? <MapScreenContent preload={preload} /> : <MapLoading />}
    </div>
  );
}

function MapScreenContent({ preload }: { preload?: Promise<InboxPreload | null> }) {
  const { user } = useAuth();
  const router = useRouter();
  const userId = user?.id;
  const [connectionRecords, setConnectionRecords] = useSessionCachedState<ConnectionRecord[]>(userId, 'connections', []);
  const [mapConnectionRecords, setMapConnectionRecords] = useSessionCachedState<ConnectionRecord[]>(userId, 'mapConnections', []);
  const [, setArchivedConnectionIds] = useSessionCachedState<Set<string>>(userId, 'archivedIds', () => new Set());
  const [, setCoreConnectionIds] = useSessionCachedState<Set<string>>(userId, 'coreIds', () => new Set());
  const [connectionsLoaded, setConnectionsInitialLoadComplete] = useSessionCachedState(userId, 'connectionsLoaded', false);
  const [, setVibePromptConnection] = useState<ConnectionRecord | null>(null);

  const archiveStorageKey = userId ? `click:archived-connections:${userId}` : null;
  const updateArchivedIds = useCallback(
    (updater: (prev: Set<string>) => Set<string>) => {
      setArchivedConnectionIds((prev) => {
        const next = updater(prev);
        if (archiveStorageKey) {
          try {
            localStorage.setItem(archiveStorageKey, JSON.stringify(Array.from(next)));
          } catch {
            /* private mode */
          }
        }
        return next;
      });
    },
    [archiveStorageKey, setArchivedConnectionIds],
  );

  useConnectionsData({
    user,
    getAuthHeaders: getFreshAuthHeaders,
    connectionRecords,
    setConnectionRecords,
    setMapConnectionRecords,
    setArchivedConnectionIds,
    setCoreConnectionIds,
    setConnectionsInitialLoadComplete,
    updateArchivedIds,
    setVibePromptConnection,
    preload,
  });

  return (
    <ConnectionMap
      userId={userId}
      connections={mapConnectionRecords}
      connectionsLoading={!connectionsLoaded}
      onConnectionClick={(conn) => router.push(threadHref(conn.id))}
      onOpenProfile={(otherUserId) => router.push(personHref(otherUserId))}
    />
  );
}
