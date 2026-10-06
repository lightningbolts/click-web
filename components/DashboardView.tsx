'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useAuth } from '@/lib/AuthContext';
import { getSupabaseClient } from '@/lib/supabase';
import { getFreshAuthHeaders } from '@/lib/auth/freshAuthHeaders';
import SettingsView from '@/components/SettingsView';
import LoadingScreen from '@/components/LoadingScreen';
import type { ConnectionRecord } from '@/components/dashboard/ConnectionTable';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  loadNotificationPreferences,
  saveNotificationPreferences,
  type NotificationPreferences,
} from '@/lib/notifications/preferences';
import { useConnectionsData } from '@/components/dashboard/useConnectionsData';
import type { DashboardTab } from '@/lib/shell/personalProductNav';
import { personHref, threadHref } from '@/lib/shell/appNav';
import { PAGE_COLUMN_CLASS } from '@/lib/shell/pageColumn';
import { cn } from '@/lib/cn';
import { useSessionCachedState, writeSessionCache } from '@/lib/dashboard/sessionCache';

// MapLibre loads only when the map pane renders (spec §11.2).
const ConnectionMap = dynamic(() => import('@/components/dashboard/ConnectionMap'), { ssr: false });

interface DashboardViewProps {
  user: any;
  /** The pane this route shows (spec §6.3: panes are routes, not `?tab=`). */
  routeTab: DashboardTab;
  onReady?: () => void;
}

/**
 * The remaining legacy panes (map and settings) until phases 4 and 6 give them their own
 * pages. Clicks, hubs and Add moved to `/clicks` and `/add`; the onboarding gates are global.
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
  const [notificationPreferences, setNotificationPreferences] = useSessionCachedState<NotificationPreferences>(userId, 'notificationPreferences', DEFAULT_NOTIFICATION_PREFERENCES);
  /** The map stays mounted after its first visit: MapLibre is expensive to rebuild. */
  const [mapVisited, setMapVisited] = useState(activeTab === 'map');
  if (activeTab === 'map' && !mapVisited) setMapVisited(true);
  const notificationPreferencesRef = useRef<NotificationPreferences>(notificationPreferences);
  const [connectionsInitialLoadComplete, setConnectionsInitialLoadComplete] = useSessionCachedState(userId, 'connectionsLoaded', false);
  const readyNotifiedRef = useRef(false);

  useEffect(() => {
    notificationPreferencesRef.current = notificationPreferences;
  }, [notificationPreferences]);

  const persistNotificationPreferences = useCallback(async (preferences: NotificationPreferences) => {
    const previousPreferences = notificationPreferencesRef.current;
    setNotificationPreferences(preferences);
    if (!user?.id) return { success: true };
    const result = await saveNotificationPreferences(getSupabaseClient(), user.id, preferences);
    if (!result.success) setNotificationPreferences(previousPreferences);
    return result;
  }, [user?.id, setNotificationPreferences]);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    void loadNotificationPreferences(getSupabaseClient(), user.id).then((preferences) => {
      if (!cancelled) setNotificationPreferences(preferences);
    });
    return () => {
      cancelled = true;
    };
  }, [user?.id, setNotificationPreferences]);

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

  const fillViewport = activeTab === 'map';

  return (
    <div
      data-testid="dashboard-root"
      data-fill-viewport={fillViewport ? 'true' : undefined}
      className={cn(
        'flex min-h-0 flex-col bg-background text-on-surface',
        fillViewport
          ? 'h-[calc(100dvh-var(--topbar-height)-var(--tabbar-height))] overflow-hidden'
          : 'min-h-[calc(100dvh-var(--topbar-height)-var(--tabbar-height))]',
      )}
    >
      {fillViewport ? null : (
        <div className={cn(PAGE_COLUMN_CLASS, 'flex shrink-0 flex-wrap items-start justify-between gap-4 py-6')}>
          <div>
            <h1 className="text-2xl font-bold text-on-surface">Settings</h1>
            <p className="mt-1 text-sm text-on-surface-variant">Profile, interests, and preferences</p>
          </div>
        </div>
      )}
      <div
        className={cn(
          PAGE_COLUMN_CLASS,
          'min-h-0 min-w-0 flex-1',
          fillViewport ? 'flex flex-col overflow-hidden py-4' : 'pb-8',
        )}
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

        {activeTab === 'settings' ? (
          <SettingsView
            notificationPreferences={notificationPreferences}
            onSaveNotificationPreferences={persistNotificationPreferences}
          />
        ) : null}
      </div>
    </div>
  );
}
