'use client';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { Loader } from '@/components/ds/Loader';
import type { ConnectionRecord } from '@/components/dashboard/ConnectionTable';
import { useConnectionsData } from '@/components/dashboard/useConnectionsData';
import { useAuth } from '@/lib/AuthContext';
import { getFreshAuthHeaders } from '@/lib/auth/freshAuthHeaders';
import { useSessionCachedState } from '@/lib/dashboard/sessionCache';
import { personHref, threadHref } from '@/lib/shell/appNav';

// MapLibre loads on this route only (spec §11.2).
const ConnectionMap = dynamic(() => import('@/components/map/ConnectionMap'), {
  ssr: false,
  loading: () => (
    <div className="flex flex-1 items-center justify-center bg-surface-raised">
      <Loader size={44} label="Loading map" />
    </div>
  ),
});

/**
 * `/map` (spec §7.5): full-bleed under the top bar. Loads the viewer's connections (with where they
 * met) and hands them to the map; events and Places load from the map's own viewport.
 */
export function MapScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const userId = user?.id;
  const [connectionRecords, setConnectionRecords] = useSessionCachedState<ConnectionRecord[]>(userId, 'connections', []);
  const [mapConnectionRecords, setMapConnectionRecords] = useSessionCachedState<ConnectionRecord[]>(userId, 'mapConnections', []);
  const [, setArchivedConnectionIds] = useSessionCachedState<Set<string>>(userId, 'archivedIds', () => new Set());
  const [, setCoreConnectionIds] = useSessionCachedState<Set<string>>(userId, 'coreIds', () => new Set());
  const [, setConnectionsInitialLoadComplete] = useSessionCachedState(userId, 'connectionsLoaded', false);
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
  });

  return (
    <div data-testid="map-screen" className="flex h-[calc(100dvh-var(--topbar-height)-var(--tabbar-height))] min-h-0 flex-col overflow-hidden">
      <h1 className="sr-only">Map</h1>
      <ConnectionMap
        connections={mapConnectionRecords}
        onConnectionClick={(conn) => router.push(threadHref(conn.id))}
        onOpenProfile={(otherUserId) => router.push(personHref(otherUserId))}
      />
    </div>
  );
}
