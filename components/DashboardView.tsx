'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useAuth } from '@/lib/AuthContext';
import { getFreshAuthHeaders } from '@/lib/auth/freshAuthHeaders';
import LoadingScreen from '@/components/LoadingScreen';
import type { ConnectionRecord } from '@/components/dashboard/ConnectionTable';
import { useConnectionsData } from '@/components/dashboard/useConnectionsData';
import type { DashboardTab } from '@/lib/shell/personalProductNav';
import { personHref, threadHref } from '@/lib/shell/appNav';
import { cn } from '@/lib/cn';
import { useSessionCachedState, writeSessionCache } from '@/lib/dashboard/sessionCache';

// MapLibre loads only when the map pane renders (spec §11.2).
const ConnectionMap = dynamic(() => import('@/components/map/ConnectionMap'), { ssr: false });

interface DashboardViewProps {
  user: any;
  /** The pane this route shows (spec §6.3: panes are routes, not `?tab=`). */
  routeTab: DashboardTab;
  onReady?: () => void;
}

/**
 * The remaining legacy pane (the map) until phase 6 gives it its own page. Clicks, hubs, Add and
 * Settings have their own routes; the onboarding gates are global.
 */
export default function DashboardView({ user, routeTab, onReady }: DashboardViewProps) {
  const { user: sessionUser, loading: authLoading } = useAuth();
  const router = useRouter();
  const activeTab = routeTab;
  const userId: string | undefined = user?.id;
  const [connectionRecords, setConnectionRecords] = useSessionCachedState<ConnectionRecord[]>(userId, 'connections', []);
  /** Full history for the memory map (active + archived lifecycle), excluding `connection_hidden` only. */
  const [mapConnectionRecords, setMapConnectionRecords] = useSessionCachedState<ConnectionRecord[]>(userId, 'mapConnections', []);
  const [, setArchivedConnectionIds] = useSessionCachedState<Set<string>>(userId, 'archivedIds', () => new Set());
  const [, setCoreConnectionIds] = useSessionCachedState<Set<string>>(userId, 'coreIds', () => new Set());
  const [, setVibePromptConnection] = useState<ConnectionRecord | null>(null);
  /** The map stays mounted after its first visit: MapLibre is expensive to rebuild. */
  const [mapVisited, setMapVisited] = useState(activeTab === 'map');
  if (activeTab === 'map' && !mapVisited) setMapVisited(true);
  const [connectionsInitialLoadComplete, setConnectionsInitialLoadComplete] = useSessionCachedState(userId, 'connectionsLoaded', false);
  const readyNotifiedRef = useRef(false);

  const archiveStorageKey = user?.id ? `click:archived-connections:${user.id}` : null;
  const updateArchivedIds = useCallback((updater: (prev: Set<string>) => Set<string>) => {
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
  }, [archiveStorageKey, setArchivedConnectionIds]);

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

  const waitingForData = !connectionsInitialLoadComplete;

  useEffect(() => {
    if (readyNotifiedRef.current) return;
    if (waitingForData) return;
    if (!authLoading && !sessionUser) return;
    readyNotifiedRef.current = true;
    writeSessionCache(userId, 'booted', true);
    onReady?.();
  }, [waitingForData, authLoading, sessionUser, onReady, userId]);

  if (!authLoading && !sessionUser) {
    return <LoadingScreen />;
  }

  if (waitingForData) {
    return null;
  }

  return (
    <div
      data-testid="dashboard-root"
      data-fill-viewport="true"
      className="flex h-[calc(100dvh-var(--topbar-height)-var(--tabbar-height))] min-h-0 flex-col overflow-hidden bg-bg text-fg"
    >
      {mapVisited ? (
        <div
          className={cn('min-h-0 flex-1 overflow-hidden', activeTab === 'map' ? 'flex' : 'hidden')}
          aria-hidden={activeTab !== 'map'}
        >
          <ConnectionMap
            connections={mapConnectionRecords}
            onConnectionClick={(conn) => router.push(threadHref(conn.id))}
            onOpenProfile={(otherUserId) => router.push(personHref(otherUserId))}
            active={activeTab === 'map'}
          />
        </div>
      ) : null}
    </div>
  );
}
