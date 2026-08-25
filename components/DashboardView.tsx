'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { getSupabaseClient } from '@/lib/supabase';
import { getFreshAuthHeaders } from '@/lib/auth/freshAuthHeaders';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MapPin,
  Settings,
  Users,
  QrCode,
  BookOpen,
  CalendarDays,
  MessageCircle,
  BarChart2,
} from 'lucide-react';
import useSWR from 'swr';
import DashboardEventsModule, { MINE_EVENTS_KEY, fetchMineEvents } from '@/components/dashboard/DashboardEventsModule';
import ProductAppShell from '@/components/shell/ProductAppShell';
import { fetchInsightsApiJson } from '@/lib/insights/fetchInsightsApi';
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
import CallOverlay from '@/components/chat/CallOverlay';
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
  getUnlockedAchievements,
} from '@/lib/dashboard/userMetrics';
import { isActiveChatListStatus } from '@/lib/dashboard/connectionStatus';
import { useDashboardCalls } from '@/components/dashboard/useDashboardCalls';
import { useVerifiedCliques } from '@/components/dashboard/useVerifiedCliques';
import { useChatListMetadata } from '@/components/dashboard/useChatListMetadata';
import { useOnboardingGates } from '@/components/dashboard/useOnboardingGates';
import { useConnectionsData } from '@/components/dashboard/useConnectionsData';
import { useChatSearch } from '@/components/dashboard/useChatSearch';
import { useConnectionLifecycle } from '@/components/dashboard/useConnectionLifecycle';
import { ChatTabSection } from '@/components/dashboard/ChatTabSection';
import { DashboardGroupModals } from '@/components/dashboard/DashboardGroupModals';

type DashboardTab = 'memory' | 'events' | 'map' | 'chat' | 'identity' | 'settings';

type InsightsAccessPayload = { insightsAllowed: boolean };

const insightsAccessFetcher = (url: string) =>
  fetchInsightsApiJson<InsightsAccessPayload>(url);

interface DashboardViewProps {
  user: any;
}

/**
 * DashboardView - The Digital Memory Box experience
 * Combines connections, timeline, map, QR identity, and settings
 *
 * The heavy data/call/lifecycle logic lives in the sibling
 * components/dashboard/use* hooks; this component owns the shared state and
 * the tab shell.
 */
export default function DashboardView({ user }: DashboardViewProps) {
  const { signOut, onlineUserIds } = useAuth();
  const [activeTab, setActiveTab] = useState<DashboardTab>('memory');
  const [connectionRecords, setConnectionRecords] = useState<ConnectionRecord[]>([]);
  /** Full history for the memory map (active + archived lifecycle), excluding `connection_hidden` only. */
  const [mapConnectionRecords, setMapConnectionRecords] = useState<ConnectionRecord[]>([]);
  const chapters = useMemo(
    () => generateChaptersFromConnections(connectionRecords),
    [connectionRecords],
  );
  /** The connection whose chat is currently open, or null */
  const [selectedConnection, setSelectedConnection] = useState<ConnectionRecord | null>(null);
  const [chatListTab, setChatListTab] = useState<'active' | 'archived'>('active');
  const [targetMessageId, setTargetMessageId] = useState<string | null>(null);
  const [archivedConnectionIds, setArchivedConnectionIds] = useState<Set<string>>(new Set());
  const [coreConnectionIds, setCoreConnectionIds] = useState<Set<string>>(new Set());
  const [blockedUserIds, setBlockedUserIds] = useState<Set<string>>(new Set());
  const [menuConnectionId, setMenuConnectionId] = useState<string | null>(null);
  const [suppressClickConnectionId, setSuppressClickConnectionId] = useState<string | null>(null);
  const [vibePromptConnection, setVibePromptConnection] = useState<ConnectionRecord | null>(null);
  const [groupClicksReloadNonce, setGroupClicksReloadNonce] = useState(0);
  const [createClickOpen, setCreateClickOpen] = useState(false);
  const [notificationPreferences, setNotificationPreferences] = useState<NotificationPreferences>(DEFAULT_NOTIFICATION_PREFERENCES);
  /** Re-render countdown labels periodically */
  const [archiveCountdownTick, setArchiveCountdownTick] = useState(0);
  const activeTabRef = useRef<DashboardTab>(activeTab);
  const selectedConnectionRef = useRef<ConnectionRecord | null>(selectedConnection);
  const notificationPreferencesRef = useRef<NotificationPreferences>(notificationPreferences);
  const chatConnectionMapRef = useRef<Map<string, string>>(new Map());

  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const [profileConnectionId, setProfileConnectionId] = useState<string | null>(null);
  const [chatMessagesSnapshot, setChatMessagesSnapshot] = useState<Message[]>([]);
  const profileDecryptedMessages = useMemo<DecryptedProfileMessage[]>(
    () =>
      chatMessagesSnapshot.map((m) => ({
        id: m.id,
        content: m.content,
        timestamp: new Date(m.time_created).toISOString(),
        messageType: m.message_type,
        metadata: m.metadata as Record<string, unknown> | null,
      })),
    [chatMessagesSnapshot],
  );
  const [chatListGroupRenameGroupId, setChatListGroupRenameGroupId] = useState<string | null>(null);
  const [chatListGroupRenameInput, setChatListGroupRenameInput] = useState('');
  const [chatListGroupRenameBusy, setChatListGroupRenameBusy] = useState(false);
  const [chatListGroupActionBusyId, setChatListGroupActionBusyId] = useState<string | null>(null);

  /** Avoid painting stats at 0 before the first `/api/connections` response (hydrates real counts). */
  const [connectionsInitialLoadComplete, setConnectionsInitialLoadComplete] = useState(false);

  const getAuthHeaders = useCallback(async (): Promise<HeadersInit> => getFreshAuthHeaders(), []);

  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  useEffect(() => {
    selectedConnectionRef.current = selectedConnection;
  }, [selectedConnection]);

  useEffect(() => {
    notificationPreferencesRef.current = notificationPreferences;
  }, [notificationPreferences]);

  const showBrowserNotification = useCallback((
    title: string,
    body: string,
    onClick?: () => void,
  ) => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;

    const notification = new Notification(title, {
      body,
      icon: '/icon.png',
      badge: '/icon.png',
      silent: false,
    });

    notification.onclick = () => {
      notification.close();
      window.focus();
      onClick?.();
    };
  }, []);

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
  }, [user?.id]);

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
  }, [user?.id]);

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
  }, [writeArchivedToLocalStorage]);

  const {
    groupCliqueRecords,
    verifiedClickMemberSetKeys,
    groupMemberPickerRows,
    showGroupMemberPicker,
    setShowGroupMemberPicker,
    groupMemberPickerBusy,
    openVerifiedCliqueMemberPicker,
  } = useVerifiedCliques({ user, groupClicksReloadNonce });

  const {
    callOverlayState,
    activeCallState,
    startOutgoingCall,
    acceptIncomingCall,
    declineIncomingCall,
    cancelPendingCall,
    dismissEndedCall,
    endActiveCall,
    toggleMicrophone,
    toggleCamera,
  } = useDashboardCalls({
    user,
    getAuthHeaders,
    connectionRecords,
    notificationPreferencesRef,
    showBrowserNotification,
    setSelectedConnection,
    setActiveTab,
  });

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
    openActionMenu,
    removeConnection,
    reportConnection,
    blockUser,
    unblockUser,
    startLongPress,
    endLongPress,
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
    setSuppressClickConnectionId,
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
  }, []);

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

  const { data: insightsAccess } = useSWR(
    user ? '/api/user/insights-access' : null,
    insightsAccessFetcher,
  );
  useSWR(user ? MINE_EVENTS_KEY : null, fetchMineEvents, {
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
  });

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

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
  }, [connectionRecords, groupCliqueRecords, selectedConnection]);

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

  const unlockedAchievements = useMemo(
    () => getUnlockedAchievements(dashboardMetrics),
    [dashboardMetrics]
  );

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

  const tabs: { id: DashboardTab; label: string; icon: any }[] = [
    { id: 'memory', label: 'Memory Box', icon: BookOpen },
    { id: 'events', label: 'Events', icon: CalendarDays },
    { id: 'map', label: 'Map', icon: MapPin },
    { id: 'chat', label: 'Chat', icon: MessageCircle },
    { id: 'identity', label: 'QR Identity', icon: QrCode },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  if (!connectionsInitialLoadComplete || !birthdayProfileGateResolved) {
    return <LoadingScreen />;
  }

  return (
    <ProductAppShell
      productLabel="Click"
      productHref="/"
      items={tabs.map((tab) => ({
        id: tab.id,
        label: tab.label,
        icon: tab.icon,
      }))}
      activeId={activeTab}
      onSelect={(id) => setActiveTab(id as DashboardTab)}
      title={
        <>
          Welcome back, <span className="text-primary">{userName}</span>
        </>
      }
      subtitle="Your digital memory box"
      extraNav={
        insightsAccess?.insightsAllowed
          ? [{ href: '/insights', label: 'Insights', icon: BarChart2 }]
          : []
      }
      userLabel={userName}
      onSignOut={handleSignOut}
      rootTestId="dashboard-root"
      chromeTestId="dashboard-chrome"
      itemTestIdPrefix="dashboard-tab"
      fillViewport={activeTab === 'chat'}
      hideHeader={activeTab === 'chat'}
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

          <AnimatePresence mode="wait">
            {/* Memory Box Tab */}
            {activeTab === 'memory' && (
              <motion.div
                key="memory"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
                className="space-y-8"
              >
                {/* Stats Overview Section */}
                <section>
                  <StatsOverview
                    totalConnections={dashboardMetrics.totalConnections}
                    thisMonth={dashboardMetrics.thisMonth}
                    streak={dashboardMetrics.streak}
                    retentionRate={dashboardMetrics.retentionRate}
                    totalNetworkGrowthPercent={dashboardMetrics.totalNetworkGrowthPercent}
                    thisMonthTrendPercent={dashboardMetrics.thisMonthTrendPercent}
                  />
                </section>

                <MyAvailabilityIntentsCard getAuthHeaders={getAuthHeaders} />

                {homeAvailabilityOverlapLines.length > 0 ? (
                  <div className="space-y-2">
                    {homeAvailabilityOverlapLines.map((line, i) => (
                      <p
                        key={`${line}-${i}`}
                        className="text-sm font-medium text-amber-900 dark:text-amber-100"
                      >
                        {line}
                      </p>
                    ))}
                  </div>
                ) : null}

                {/* Achievements & Milestones Row */}
                <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-3">
                    <h3 className="text-sm font-medium text-on-surface-variant mb-2">Recent Achievements</h3>
                    {unlockedAchievements.length === 0 ? (
                      <div className="p-4 fc-card rounded-xl border border-border-hard text-sm text-on-surface-variant">
                        No achievements yet. Connect with people to unlock your first badge.
                      </div>
                    ) : (
                      unlockedAchievements.slice(0, 5).map((achievement) => (
                        <AchievementBadge
                          key={achievement.id}
                          title={achievement.title}
                          description={achievement.description}
                          icon={achievement.icon}
                        />
                      ))
                    )}
                  </div>
                  <div className="space-y-3">
                    <h3 className="text-sm font-medium text-on-surface-variant mb-2">Next Milestone</h3>
                    <MilestoneProgress
                      current={dashboardMetrics.totalConnections}
                      target={nextMilestone.target}
                      label={nextMilestone.label}
                      reward={nextMilestone.reward}
                    />
                  </div>
                </section>

                {/* Time Capsule Section */}
                <section className="fc-card p-6 rounded-[16px] border border-border-hard">
                  <TimeCapsule chapters={chapters} onConnectionClick={handleOpenChat} />
                </section>

                {/* Connection Table Section */}
                <section className="fc-card p-6 rounded-[16px] border border-border-hard">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-primary/20 rounded-xl">
                      <Users className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold">People I've Met</h2>
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

                {/* Data sovereignty notice */}
                <div className="text-center py-4">
                  <p className="text-xs text-outline">
                    🔒 Your data belongs to you. Export anytime, delete anytime.
                  </p>
                </div>
              </motion.div>
            )}

            {/* Events Tab */}
            {activeTab === 'events' && (
              <motion.div
                key="events"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
              >
                <DashboardEventsModule />
              </motion.div>
            )}

            {/* Map Tab */}
            {activeTab === 'map' && (
              <motion.div
                key="map"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
              >
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 bg-primary/20 rounded-xl">
                    <MapPin className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold">Click Map</h2>
                    <p className="text-sm text-on-surface-variant">Where your memories were made</p>
                  </div>
                </div>

                <ConnectionMap connections={mapConnectionRecords} onConnectionClick={handleOpenChat} />
              </motion.div>
            )}

            {/* Chat Tab */}
            {activeTab === 'chat' && (
              <motion.div
                key="chat"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="flex h-full min-h-0 flex-col overflow-hidden"
              >
                <ChatTabSection
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
                  openActionMenu={openActionMenu}
                  suppressClickConnectionId={suppressClickConnectionId}
                  setSuppressClickConnectionId={setSuppressClickConnectionId}
                  startLongPress={startLongPress}
                  endLongPress={endLongPress}
                  addConnectionToCore={addConnectionToCore}
                  removeConnectionFromCore={removeConnectionFromCore}
                  archiveConnection={archiveConnection}
                  unarchiveConnection={unarchiveConnection}
                  removeConnection={removeConnection}
                  reportConnection={reportConnection}
                  blockUser={blockUser}
                  unblockUser={unblockUser}
                  startOutgoingCall={startOutgoingCall}
                  setCreateClickOpen={setCreateClickOpen}
                  setProfileUserId={setProfileUserId}
                  setProfileConnectionId={setProfileConnectionId}
                  setGroupClicksReloadNonce={setGroupClicksReloadNonce}
                  setChatMessagesSnapshot={setChatMessagesSnapshot}
                  groupMemberPickerBusy={groupMemberPickerBusy}
                  openVerifiedCliqueMemberPicker={openVerifiedCliqueMemberPicker}
                  selectedConnectionRef={selectedConnectionRef}
                  setChatListGroupRenameGroupId={setChatListGroupRenameGroupId}
                  setChatListGroupRenameInput={setChatListGroupRenameInput}
                  chatListGroupActionBusyId={chatListGroupActionBusyId}
                  setChatListGroupActionBusyId={setChatListGroupActionBusyId}
                />
              </motion.div>
            )}

            {/* QR Identity Tab */}
            {activeTab === 'identity' && (
              <motion.div
                key="identity"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
                className="max-w-md mx-auto"
              >
                <QRIdentityCard
                  userId={user.id}
                  userName={displayNameFromUserMetadata(user?.user_metadata)}
                  userEmail={user?.email}
                />
              </motion.div>
            )}

            {/* Settings Tab */}
            {activeTab === 'settings' && (
              <motion.div
                key="settings"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
              >
                <SettingsView
                  notificationPreferences={notificationPreferences}
                  onSaveNotificationPreferences={persistNotificationPreferences}
                />
              </motion.div>
            )}
          </AnimatePresence>

      <CallOverlay
        currentUserId={user.id}
        overlayState={callOverlayState}
        activeCall={activeCallState}
        onAccept={acceptIncomingCall}
        onDecline={declineIncomingCall}
        onCancel={cancelPendingCall}
        onDismissEnded={dismissEndedCall}
        onEndCall={endActiveCall}
        onToggleMicrophone={toggleMicrophone}
        onToggleCamera={toggleCamera}
      />

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
          (profileConnectionId ?? selectedConnection?.id ?? null) &&
          (selectedConnection?.chatKind === 'group_clique' ||
            groupCliqueRecords.some(
              (g) => g.id === (profileConnectionId ?? selectedConnection?.id),
            ))
            ? null
            : (profileConnectionId ?? selectedConnection?.id ?? null)
        }
        chatId={
          selectedConnection?.chatKind === 'group_clique'
            ? selectedConnection.groupChatId ?? null
            : groupCliqueRecords.find((g) => g.id === profileConnectionId)?.groupChatId ?? null
        }
        groupId={
          selectedConnection?.chatKind === 'group_clique'
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

    </ProductAppShell>
  );
}
