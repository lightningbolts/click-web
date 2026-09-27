'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/AuthContext';
import { getSupabaseClient } from '@/lib/supabase';
import { getFreshAuthHeaders } from '@/lib/auth/freshAuthHeaders';
import { motion, useReducedMotion } from 'framer-motion';
import { Users } from 'lucide-react';
import useSWR from 'swr';
import { MINE_EVENTS_KEY, fetchMineEvents } from '@/components/dashboard/DashboardEventsModule';
import SettingsView from '@/components/SettingsView';
import LoadingScreen from '@/components/LoadingScreen';
import { CreateVerifiedClickDialog } from '@/components/chat';
import InterestTagging from '@/components/InterestTagging';
import { displayNameFromUserMetadata } from '@/lib/userDisplayName';

// Digital Memory Box components
import {
  ConnectionTable,
  TimeCapsule,
  QRIdentityCard,
  StatsOverview,
  AchievementBadge,
  MilestoneProgress,
  ConnectionMap,
} from '@/components/dashboard';
import MyAvailabilityIntentsCard from '@/components/dashboard/MyAvailabilityIntentsCard';
import type { ConnectionRecord } from '@/components/dashboard/ConnectionTable';
import UserProfileModal, { type DecryptedProfileMessage } from '@/components/UserProfileModal';
import type { Message } from '@/lib/chat/types';
import PostConnectionVibePrompt from '@/components/dashboard/PostConnectionVibePrompt';
import {
  downloadCSV,
  generateChaptersFromConnections
} from '@/lib/dashboard/mockData';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  loadNotificationPreferences,
  saveNotificationPreferences,
  type NotificationPreferences,
} from '@/lib/notifications/preferences';
import {
  buildDashboardMetrics,
  getNextMilestone,
  getAllAchievements,
} from '@/lib/dashboard/userMetrics';
import { isActiveChatListStatus } from '@/lib/dashboard/connectionStatus';
import { useVerifiedCliques } from '@/components/dashboard/useVerifiedCliques';
import { useChatListMetadata } from '@/components/dashboard/useChatListMetadata';
import { useOnboardingGates } from '@/components/dashboard/useOnboardingGates';
import { useConnectionsData } from '@/components/dashboard/useConnectionsData';
import { useChatSearch } from '@/components/dashboard/useChatSearch';
import { useConnectionLifecycle } from '@/components/dashboard/useConnectionLifecycle';
import { ChatTabSection } from '@/components/dashboard/ChatTabSection';
import { DashboardGroupModals } from '@/components/dashboard/DashboardGroupModals';
import { messagesForProfileConnection } from '@/lib/userProfile/profileChatContext';
import {
  dashboardTabHref,
  parseDashboardTab,
  type DashboardTab,
} from '@/lib/shell/personalProductNav';
import { PAGE_COLUMN_CLASS } from '@/lib/shell/pageColumn';
import { cn } from '@/lib/cn';
import { useSessionCachedState, writeSessionCache } from '@/lib/dashboard/sessionCache';

interface DashboardViewProps {
  user: any;
  onReady?: () => void;
}

/**
 * DashboardView - The Digital Memory Box experience
 * Combines connections, timeline, map, QR identity, and settings
 *
 * The heavy data/call/lifecycle logic lives in the sibling
 * components/dashboard/use* hooks; this component owns shared state and
 * the tab pane under the global Navbar.
 */
export default function DashboardView({ user, onReady }: DashboardViewProps) {
  const { user: sessionUser, loading: authLoading, onlineUserIds } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<DashboardTab>(() =>
    parseDashboardTab(searchParams.get('tab')),
  );
  const userId: string | undefined = user?.id;
  const [connectionRecords, setConnectionRecords] = useSessionCachedState<ConnectionRecord[]>(userId, 'connections', []);
  /** Full history for the memory map (active + archived lifecycle), excluding `connection_hidden` only. */
  const [mapConnectionRecords, setMapConnectionRecords] = useSessionCachedState<ConnectionRecord[]>(userId, 'mapConnections', []);
  const chapters = useMemo(
    () => generateChaptersFromConnections(connectionRecords),
    [connectionRecords],
  );
  /** The connection whose chat is currently open, or null */
  const [selectedConnection, setSelectedConnection] = useSessionCachedState<ConnectionRecord | null>(userId, 'selectedConnection', null);
  const [chatListTab, setChatListTab] = useSessionCachedState<'active' | 'archived'>(userId, 'chatListTab', 'active');
  const [targetMessageId, setTargetMessageId] = useState<string | null>(null);
  const [archivedConnectionIds, setArchivedConnectionIds] = useSessionCachedState<Set<string>>(userId, 'archivedIds', () => new Set());
  const [coreConnectionIds, setCoreConnectionIds] = useSessionCachedState<Set<string>>(userId, 'coreIds', () => new Set());
  const [blockedUserIds, setBlockedUserIds] = useState<Set<string>>(new Set());
  const [menuConnectionId, setMenuConnectionId] = useState<string | null>(null);
  const [vibePromptConnection, setVibePromptConnection] = useState<ConnectionRecord | null>(null);
  const [groupClicksReloadNonce, setGroupClicksReloadNonce] = useState(0);
  const [createClickOpen, setCreateClickOpen] = useState(false);
  const [notificationPreferences, setNotificationPreferences] = useSessionCachedState<NotificationPreferences>(userId, 'notificationPreferences', DEFAULT_NOTIFICATION_PREFERENCES);
  /** Re-render countdown labels periodically */
  const [archiveCountdownTick, setArchiveCountdownTick] = useState(0);
  const activeTabRef = useRef<DashboardTab>(activeTab);
  /** Tabs whose panes have mounted at least once (map/chat are kept alive after that). */
  const [visitedTabs, setVisitedTabs] = useState<ReadonlySet<DashboardTab>>(() => new Set([activeTab]));
  useEffect(() => {
    setVisitedTabs((prev) => (prev.has(activeTab) ? prev : new Set([...prev, activeTab])));
  }, [activeTab]);
  const selectedConnectionRef = useRef<ConnectionRecord | null>(selectedConnection);
  const notificationPreferencesRef = useRef<NotificationPreferences>(notificationPreferences);
  const chatConnectionMapRef = useRef<Map<string, string>>(new Map());

  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const [profileConnectionId, setProfileConnectionId] = useState<string | null>(null);
  const [chatMessagesSnapshot, setChatMessagesSnapshot] = useState<Message[]>([]);
  const profileDecryptedMessages = useMemo<DecryptedProfileMessage[]>(() => {
    const scopedMessages = messagesForProfileConnection(
      chatMessagesSnapshot,
      profileConnectionId,
      selectedConnection?.id,
    );
    return scopedMessages.map((m) => ({
        id: m.id,
        content: m.content,
        timestamp: new Date(m.time_created).toISOString(),
        messageType: m.message_type,
        metadata: m.metadata as Record<string, unknown> | null,
      }));
  }, [chatMessagesSnapshot, profileConnectionId, selectedConnection]);
  const [chatListGroupRenameGroupId, setChatListGroupRenameGroupId] = useState<string | null>(null);
  const [chatListGroupRenameInput, setChatListGroupRenameInput] = useState('');
  const [chatListGroupRenameBusy, setChatListGroupRenameBusy] = useState(false);
  const [chatListGroupActionBusyId, setChatListGroupActionBusyId] = useState<string | null>(null);

  /** Avoid painting stats at 0 before the first `/api/connections` response (hydrates real counts). */
  const [connectionsInitialLoadComplete, setConnectionsInitialLoadComplete] = useSessionCachedState(userId, 'connectionsLoaded', false);

  const getAuthHeaders = useCallback(async (): Promise<HeadersInit> => getFreshAuthHeaders(), []);

  const readyNotifiedRef = useRef(false);

  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  useEffect(() => {
    setActiveTab(parseDashboardTab(searchParams.get('tab')));
  }, [searchParams]);

  useEffect(() => {
    if (activeTab === 'events') {
      router.replace('/events');
    }
  }, [activeTab, router]);

  useEffect(() => {
    selectedConnectionRef.current = selectedConnection;
  }, [selectedConnection]);

  useEffect(() => {
    notificationPreferencesRef.current = notificationPreferences;
  }, [notificationPreferences]);

  const persistNotificationPreferences = useCallback(async (preferences: NotificationPreferences) => {
    const previousPreferences = notificationPreferencesRef.current;
    setNotificationPreferences(preferences);

    if (!user?.id) {
      return { success: true };
    }

    const result = await saveNotificationPreferences(getSupabaseClient(), user.id, preferences);
    if (!result.success) {
      setNotificationPreferences(previousPreferences);
    }
    return result;
  }, [user?.id, setNotificationPreferences]);

  useEffect(() => {
    if (!user?.id) {
      setNotificationPreferences(DEFAULT_NOTIFICATION_PREFERENCES);
      return;
    }

    let cancelled = false;

    const loadPreferences = async () => {
      const preferences = await loadNotificationPreferences(getSupabaseClient(), user.id);
      if (!cancelled) {
        setNotificationPreferences(preferences);
      }
    };

    void loadPreferences();

    return () => {
      cancelled = true;
    };
  }, [user?.id, setNotificationPreferences]);

  const archiveStorageKey = user?.id ? `click:archived-connections:${user.id}` : null;

  const writeArchivedToLocalStorage = useCallback((ids: Set<string>) => {
    if (!archiveStorageKey || typeof window === 'undefined') return;
    localStorage.setItem(archiveStorageKey, JSON.stringify(Array.from(ids)));
  }, [archiveStorageKey]);

  const updateArchivedIds = useCallback((updater: (prev: Set<string>) => Set<string>) => {
    setArchivedConnectionIds((prev) => {
      const next = updater(prev);
      writeArchivedToLocalStorage(next);
      return next;
    });
  }, [writeArchivedToLocalStorage, setArchivedConnectionIds]);

  const {
    groupCliqueRecords,
    verifiedClickMemberSetKeys,
    groupMemberPickerRows,
    showGroupMemberPicker,
    setShowGroupMemberPicker,
    openVerifiedCliqueMemberPicker,
  } = useVerifiedCliques({ user, groupClicksReloadNonce });

  const { chatMetadataByConnectionId } = useChatListMetadata({
    user,
    connectionRecords,
    selectedConnection,
    groupCliqueRecords,
    chatConnectionMapRef,
  });

  const {
    needsTagging,
    handleTagsComplete,
    handleTagsSkip,
    birthdayProfileGateResolved,
    birthdayProfileGateOpen,
    setBirthdayProfileGateOpen,
  } = useOnboardingGates({ user, getAuthHeaders, setProfileUserId, setProfileConnectionId });

  const waitingForData =
    !connectionsInitialLoadComplete || !birthdayProfileGateResolved || activeTab === 'events';

  useEffect(() => {
    if (readyNotifiedRef.current) return;
    if (waitingForData) return;
    if (!authLoading && !sessionUser) return;
    readyNotifiedRef.current = true;
    writeSessionCache(userId, 'booted', true);
    onReady?.();
  }, [waitingForData, authLoading, sessionUser, onReady, userId]);

  const { loadConnections } = useConnectionsData({
    user,
    getAuthHeaders,
    connectionRecords,
    setConnectionRecords,
    setMapConnectionRecords,
    setArchivedConnectionIds,
    setCoreConnectionIds,
    setConnectionsInitialLoadComplete,
    updateArchivedIds,
    setVibePromptConnection,
  });

  const { chatSearchQuery, setChatSearchQuery, chatSearchHits, chatSearchBusy } = useChatSearch({
    user,
    getAuthHeaders,
    connectionRecords,
    groupCliqueRecords,
    chatConnectionMapRef,
  });

  const {
    archiveConnection,
    addConnectionToCore,
    removeConnectionFromCore,
    unarchiveConnection,
    removeConnection,
    reportConnection,
    blockUser,
    unblockUser,
  } = useConnectionLifecycle({
    user,
    getAuthHeaders,
    connectionRecords,
    setConnectionRecords,
    archivedConnectionIds,
    setArchivedConnectionIds,
    updateArchivedIds,
    writeArchivedToLocalStorage,
    setCoreConnectionIds,
    setBlockedUserIds,
    selectedConnection,
    setSelectedConnection,
    setMenuConnectionId,
    setChatListTab,
    loadConnections,
  });

  // Handle CSV export
  const handleExport = useCallback(() => {
    downloadCSV(connectionRecords, `click-connections-${user.email?.split('@')[0] || 'user'}`);
  }, [connectionRecords, user]);

  // Shared handler: open chat for a specific connection
  const handleOpenChat = useCallback((conn: ConnectionRecord, messageId?: string | null) => {
    setSelectedConnection(conn);
    setTargetMessageId(messageId?.trim() ? messageId.trim() : null);
    setActiveTab('chat');
    // Keep the URL (and the Navbar's active tab) in step with the pane.
    if (parseDashboardTab(new URLSearchParams(window.location.search).get('tab')) !== 'chat') {
      window.history.pushState(null, '', dashboardTabHref('chat'));
    }
  }, [setSelectedConnection]);

  const connectionRecordsWithChatPreview = useMemo(
    () =>
      connectionRecords.map((c) => ({
        ...c,
        chatPreview: chatMetadataByConnectionId[c.id]?.preview ?? c.chatPreview ?? null,
      })),
    [chatMetadataByConnectionId, connectionRecords],
  );

  const homeAvailabilityOverlapLines = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const c of connectionRecords) {
      if (!c.otherUserId || !c.intentOverlapLabel) continue;
      if (seen.has(c.otherUserId)) continue;
      seen.add(c.otherUserId);
      const first = c.name.trim().split(/\s+/)[0] || 'them';
      out.push(`You and ${first} are both available right now!`);
    }
    return out;
  }, [connectionRecords]);

  const userName =
    displayNameFromUserMetadata(user?.user_metadata) || user?.email?.split('@')[0] || 'User';

  useSWR(user ? MINE_EVENTS_KEY : null, fetchMineEvents, {
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
  });

  useEffect(() => {
    const id = setInterval(() => setArchiveCountdownTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!selectedConnection) return;
    const known =
      connectionRecords.some((c) => c.id === selectedConnection.id) ||
      groupCliqueRecords.some((c) => c.id === selectedConnection.id);
    if (!known) {
      setSelectedConnection(null);
    }
  }, [connectionRecords, groupCliqueRecords, selectedConnection, setSelectedConnection]);

  const chatCandidates = useMemo(
    () =>
      [...connectionRecords, ...groupCliqueRecords]
        .filter((c) =>
          c.chatKind === 'group_clique'
            ? isActiveChatListStatus(c.status)
            : isActiveChatListStatus(c.status) || c.status === 'archived',
        )
        .map((connection) => {
          const metadata = chatMetadataByConnectionId[connection.id];
          return {
            ...connection,
            chatPreview: metadata?.preview ?? null,
            chatLastMessageAt: metadata?.lastMessageAt ?? null,
            chatUpdatedAt: metadata?.chatUpdatedAt ?? null,
            chatUnreadCount: metadata?.unreadCount ?? 0,
            chatId: metadata?.chatId ?? connection.groupChatId ?? null,
          };
        })
        .sort((left, right) => {
          const leftTimestamp = left.chatLastMessageAt ?? left.chatUpdatedAt ?? left.dateMet.getTime();
          const rightTimestamp = right.chatLastMessageAt ?? right.chatUpdatedAt ?? right.dateMet.getTime();
          return rightTimestamp - leftTimestamp;
        }),
    [chatMetadataByConnectionId, connectionRecords, groupCliqueRecords],
  );

  const activeConnections = useMemo(
    () =>
      chatCandidates
        .filter((c) => !archivedConnectionIds.has(c.id) && c.status !== 'archived')
        .sort((left, right) => {
          const leftCore = coreConnectionIds.has(left.id) ? 1 : 0;
          const rightCore = coreConnectionIds.has(right.id) ? 1 : 0;
          if (leftCore !== rightCore) return rightCore - leftCore;
          const leftTimestamp = left.chatLastMessageAt ?? left.chatUpdatedAt ?? left.dateMet.getTime();
          const rightTimestamp = right.chatLastMessageAt ?? right.chatUpdatedAt ?? right.dateMet.getTime();
          return rightTimestamp - leftTimestamp;
        }),
    [archivedConnectionIds, chatCandidates, coreConnectionIds],
  );

  const archivedConnections = useMemo(() => {
    const serverArchived = chatCandidates.filter((c) => c.status === 'archived');
    const userArchivedOnly = chatCandidates.filter(
      (c) => archivedConnectionIds.has(c.id) && c.status !== 'archived',
    );
    const byId = new Map<string, (typeof chatCandidates)[number]>();
    for (const c of [...serverArchived, ...userArchivedOnly]) {
      if (!byId.has(c.id)) byId.set(c.id, c);
    }
    return Array.from(byId.values()).sort((a, b) => {
      const left = a.chatLastMessageAt ?? a.chatUpdatedAt ?? a.dateMet.getTime();
      const right = b.chatLastMessageAt ?? b.chatUpdatedAt ?? b.dateMet.getTime();
      return right - left;
    });
  }, [archivedConnectionIds, chatCandidates]);

  const dashboardMetrics = useMemo(
    () => buildDashboardMetrics(connectionRecords),
    [connectionRecords]
  );

  const achievementStatuses = useMemo(
    () => getAllAchievements(dashboardMetrics),
    [dashboardMetrics]
  );

  const shellHeader = useMemo(() => {
    switch (activeTab) {
      case 'memory':
        return {
          title: (
            <>
              Welcome back, <span className="text-primary">{userName}</span>
            </>
          ),
          subtitle: 'Your digital memory box',
        };
      case 'events':
        return {
          title: 'Events',
          subtitle: 'Events you host or plan to attend.',
        };
      case 'map':
        return {
          title: 'Click Map',
          subtitle: 'Where your memories were made',
        };
      case 'identity':
        return {
          title: 'QR Identity',
          subtitle: 'Share your Click ID to connect in person',
        };
      case 'settings':
        return {
          title: 'Settings',
          subtitle: 'Profile, interests, and preferences',
        };
      default:
        return { title: userName, subtitle: undefined };
    }
  }, [activeTab, userName]);

  const nextMilestone = useMemo(
    () => getNextMilestone(dashboardMetrics.totalConnections),
    [dashboardMetrics.totalConnections]
  );

  const visibleChatConnections = chatListTab === 'active' ? activeConnections : archivedConnections;

  const clickFriendOptions = useMemo(() => {
    if (!user?.id) return [];
    return connectionRecords
      .filter(
        (c) =>
          c.chatKind !== 'group_clique' &&
          isActiveChatListStatus(c.status) &&
          !!c.otherUserId,
      )
      .map((c) => ({
        connectionId: c.id,
        userId: c.otherUserId as string,
        name: c.name,
      }));
  }, [connectionRecords, user?.id]);

  const formatChatActivity = useCallback((timestamp?: number | null) => {
    if (!timestamp) return null;

    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = timestamp - now.getTime();
    const diffMinutes = Math.round(diffMs / 60000);
    const diffHours = Math.round(diffMs / 3600000);
    const diffDays = Math.round(diffMs / 86400000);
    const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

    if (Math.abs(diffMinutes) < 1) return 'just now';
    if (Math.abs(diffMinutes) < 60) return rtf.format(diffMinutes, 'minute');
    if (Math.abs(diffHours) < 24) return rtf.format(diffHours, 'hour');
    if (Math.abs(diffDays) < 6) return rtf.format(diffDays, 'day');

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      ...(date.getFullYear() !== now.getFullYear() ? { year: 'numeric' as const } : {}),
    });
  }, []);

  const fillViewport = activeTab === 'chat' || activeTab === 'map';
  const hideHeader = activeTab === 'chat';

  if (!authLoading && !sessionUser) {
    return <LoadingScreen />;
  }

  if (waitingForData) {
    return null;
  }

  return (
    <div
      data-testid="dashboard-root"
      data-fill-viewport={fillViewport ? 'true' : undefined}
      className={cn(
        'flex min-h-0 flex-col bg-background text-on-surface',
        fillViewport
          ? 'h-[calc(100dvh-var(--navbar-height))] overflow-hidden'
          : 'min-h-[calc(100dvh-var(--navbar-height))]',
      )}
    >
      {hideHeader ? null : (
        <div
          className={cn(
            PAGE_COLUMN_CLASS,
            'flex shrink-0 flex-wrap items-start justify-between gap-4 py-6',
          )}
        >
          <div>
            <h1 className="text-2xl font-bold text-on-surface">{shellHeader.title}</h1>
            {shellHeader.subtitle ? (
              <p className="mt-1 text-sm text-on-surface-variant">{shellHeader.subtitle}</p>
            ) : null}
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
      {needsTagging === true && (
        <InterestTagging
          onComplete={handleTagsComplete}
          onSkip={handleTagsSkip}
          canSkip={true}
        />
      )}

      {user?.id && getSupabaseClient() ? (
        <CreateVerifiedClickDialog
          open={createClickOpen}
          onOpenChange={setCreateClickOpen}
          supabase={getSupabaseClient()!}
          currentUserId={user.id}
          currentUserLabel={userName}
          friends={clickFriendOptions}
          existingVerifiedMemberSetKeys={verifiedClickMemberSetKeys}
          onCreated={() => setGroupClicksReloadNonce((n) => n + 1)}
        />
      ) : null}

          {activeTab === 'memory' ? (
            <TabPaneEnter key="memory" className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
              <div className="min-w-0 space-y-6">
                <section aria-label="Your stats">
                  <StatsOverview
                    totalConnections={dashboardMetrics.totalConnections}
                    thisMonth={dashboardMetrics.thisMonth}
                    streak={dashboardMetrics.streak}
                    retentionRate={dashboardMetrics.retentionRate}
                    totalNetworkGrowthPercent={dashboardMetrics.totalNetworkGrowthPercent}
                    thisMonthTrendPercent={dashboardMetrics.thisMonthTrendPercent}
                  />
                </section>

                <section className="fc-card rounded-[16px] border border-border-hard p-5 md:p-6">
                  <TimeCapsule chapters={chapters} onConnectionClick={handleOpenChat} />
                </section>

                <section className="fc-card rounded-[16px] border border-border-hard p-5 md:p-6">
                  <div className="mb-5 flex items-center gap-3">
                    <div className="rounded-[10px] bg-primary-container p-2">
                      <Users className="h-5 w-5 text-on-primary-container" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold">People I&apos;ve Met</h2>
                      <p className="text-sm text-on-surface-variant">Your connection history</p>
                    </div>
                  </div>
                  <ConnectionTable
                    connections={connectionRecordsWithChatPreview}
                    onExport={handleExport}
                    onSelect={handleOpenChat}
                    onOpenProfile={(id, connectionId) => {
                      setProfileConnectionId(connectionId ?? null);
                      setProfileUserId(id);
                    }}
                  />
                </section>

                <p className="py-2 text-center text-xs text-outline">
                  🔒 Your data belongs to you. Export anytime, delete anytime.
                </p>
              </div>

              <aside className="space-y-4 lg:sticky lg:top-6" aria-label="Right now">
                <MyAvailabilityIntentsCard getAuthHeaders={getAuthHeaders} />

                {homeAvailabilityOverlapLines.length > 0 ? (
                  <div className="space-y-1.5 rounded-[16px] border border-primary/30 bg-primary-container p-4">
                    {homeAvailabilityOverlapLines.map((line, i) => (
                      <p key={`${line}-${i}`} className="text-sm font-semibold text-on-primary-container">
                        {line}
                      </p>
                    ))}
                  </div>
                ) : null}

                <section className="space-y-2">
                  <h3 className="text-sm font-bold text-on-surface-variant">Next milestone</h3>
                  <MilestoneProgress
                    current={dashboardMetrics.totalConnections}
                    target={nextMilestone.target}
                    label={nextMilestone.label}
                    reward={nextMilestone.reward}
                  />
                </section>

                <section className="space-y-2">
                  <h3 className="text-sm font-bold text-on-surface-variant">Achievements</h3>
                  <div className="space-y-2">
                    {achievementStatuses.map((achievement) => (
                      <AchievementBadge
                        key={achievement.id}
                        title={achievement.title}
                        description={achievement.description}
                        icon={achievement.icon}
                        unlocked={achievement.unlocked}
                      />
                    ))}
                  </div>
                </section>
              </aside>
            </TabPaneEnter>
          ) : null}

          {/* Map and chat stay mounted after their first visit: MapLibre and an open
              thread are expensive to rebuild, and remounting them was the visible
              flash when switching tabs. Hidden panes do not mark messages read. */}
          {visitedTabs.has('map') ? (
            <div
              className={cn('min-h-0 flex-1 overflow-hidden', activeTab === 'map' ? 'flex' : 'hidden')}
              aria-hidden={activeTab !== 'map'}
            >
              <ConnectionMap
                connections={mapConnectionRecords}
                onConnectionClick={handleOpenChat}
                onOpenProfile={(otherUserId, connectionId) => {
                  setProfileConnectionId(connectionId);
                  setProfileUserId(otherUserId);
                }}
                active={activeTab === 'map'}
              />
            </div>
          ) : null}

          {visitedTabs.has('chat') ? (
            <div
              className={cn('h-full min-h-0 flex-col overflow-hidden', activeTab === 'chat' ? 'flex' : 'hidden')}
              aria-hidden={activeTab !== 'chat'}
            >
                <ChatTabSection
                  active={activeTab === 'chat'}
                  user={user}
                  onlineUserIds={onlineUserIds}
                  selectedConnection={selectedConnection}
                  setSelectedConnection={setSelectedConnection}
                  targetMessageId={targetMessageId}
                  setTargetMessageId={setTargetMessageId}
                  connectionRecords={connectionRecords}
                  groupCliqueRecords={groupCliqueRecords}
                  archivedConnectionIds={archivedConnectionIds}
                  blockedUserIds={blockedUserIds}
                  coreConnectionIds={coreConnectionIds}
                  activeConnections={activeConnections}
                  archivedConnections={archivedConnections}
                  visibleChatConnections={visibleChatConnections}
                  chatListTab={chatListTab}
                  setChatListTab={setChatListTab}
                  chatSearchQuery={chatSearchQuery}
                  setChatSearchQuery={setChatSearchQuery}
                  chatSearchBusy={chatSearchBusy}
                  chatSearchHits={chatSearchHits}
                  handleOpenChat={handleOpenChat}
                  formatChatActivity={formatChatActivity}
                  menuConnectionId={menuConnectionId}
                  setMenuConnectionId={setMenuConnectionId}
                  addConnectionToCore={addConnectionToCore}
                  removeConnectionFromCore={removeConnectionFromCore}
                  archiveConnection={archiveConnection}
                  unarchiveConnection={unarchiveConnection}
                  removeConnection={removeConnection}
                  reportConnection={reportConnection}
                  blockUser={blockUser}
                  unblockUser={unblockUser}
                  setCreateClickOpen={setCreateClickOpen}
                  setProfileUserId={setProfileUserId}
                  setProfileConnectionId={setProfileConnectionId}
                  setGroupClicksReloadNonce={setGroupClicksReloadNonce}
                  setChatMessagesSnapshot={setChatMessagesSnapshot}
                  openVerifiedCliqueMemberPicker={openVerifiedCliqueMemberPicker}
                  selectedConnectionRef={selectedConnectionRef}
                  setChatListGroupRenameGroupId={setChatListGroupRenameGroupId}
                  setChatListGroupRenameInput={setChatListGroupRenameInput}
                  chatListGroupActionBusyId={chatListGroupActionBusyId}
                  setChatListGroupActionBusyId={setChatListGroupActionBusyId}
                />
            </div>
          ) : null}

          {activeTab === 'identity' ? (
            <TabPaneEnter
              key="identity"
              className="flex min-h-[min(70vh,640px)] flex-col items-center justify-center py-4"
            >
                <div className="w-full max-w-md">
                  <QRIdentityCard
                    userId={user.id}
                    userName={displayNameFromUserMetadata(user?.user_metadata)}
                    userEmail={user?.email}
                  />
                </div>
            </TabPaneEnter>
          ) : null}

          {activeTab === 'settings' ? (
            <TabPaneEnter key="settings">
              <SettingsView
                notificationPreferences={notificationPreferences}
                onSaveNotificationPreferences={persistNotificationPreferences}
              />
            </TabPaneEnter>
          ) : null}

      <DashboardGroupModals
        showGroupMemberPicker={showGroupMemberPicker}
        setShowGroupMemberPicker={setShowGroupMemberPicker}
        groupMemberPickerRows={groupMemberPickerRows}
        selectedConnection={selectedConnection}
        setSelectedConnection={setSelectedConnection}
        setProfileUserId={setProfileUserId}
        setProfileConnectionId={setProfileConnectionId}
        chatListGroupRenameGroupId={chatListGroupRenameGroupId}
        setChatListGroupRenameGroupId={setChatListGroupRenameGroupId}
        chatListGroupRenameInput={chatListGroupRenameInput}
        setChatListGroupRenameInput={setChatListGroupRenameInput}
        chatListGroupRenameBusy={chatListGroupRenameBusy}
        setChatListGroupRenameBusy={setChatListGroupRenameBusy}
        setGroupClicksReloadNonce={setGroupClicksReloadNonce}
      />

      <UserProfileModal
        userId={profileUserId}
        getAuthHeaders={getAuthHeaders}
        currentUserId={user?.id ?? null}
        onClose={() => {
          setProfileUserId(null);
          setProfileConnectionId(null);
          setBirthdayProfileGateOpen(false);
        }}
        forceOwnProfileBirthdayCompletion={Boolean(
          user?.id && profileUserId === user.id && birthdayProfileGateOpen,
        )}
        connectionId={
          profileConnectionId &&
          ((selectedConnection?.id === profileConnectionId &&
            selectedConnection.chatKind === 'group_clique') ||
            groupCliqueRecords.some((g) => g.id === profileConnectionId))
            ? null
            : profileConnectionId
        }
        chatId={
          selectedConnection?.id === profileConnectionId &&
          selectedConnection.chatKind === 'group_clique'
            ? selectedConnection.groupChatId ?? null
            : groupCliqueRecords.find((g) => g.id === profileConnectionId)?.groupChatId ?? null
        }
        groupId={
          selectedConnection?.id === profileConnectionId &&
          selectedConnection.chatKind === 'group_clique'
            ? selectedConnection.id
            : groupCliqueRecords.some((g) => g.id === profileConnectionId)
              ? profileConnectionId
              : null
        }
        decryptedMessages={profileDecryptedMessages}
      />

      {vibePromptConnection && user?.id ? (
        <PostConnectionVibePrompt
          connectionId={vibePromptConnection.id}
          currentUserId={user.id}
          venueLabel={vibePromptConnection.location || 'This place'}
          getAuthHeaders={getAuthHeaders}
          onClose={() => setVibePromptConnection(null)}
        />
      ) : null}

    </div>
    </div>
  );
}

/**
 * Short opacity-only arrival for lightweight tab panes. No exit phase: the old
 * pane is replaced in the same frame, so there is never an empty gap or a
 * layout that still belongs to the previous tab.
 */
function TabPaneEnter({ className, children }: { className?: string; children: React.ReactNode }) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

