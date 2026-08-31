'use client';

import { type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users,
  MessageCircle,
  MoreHorizontal,
  Clock,
  Zap,
  Volume2,
  Mountain,
  Search,
} from 'lucide-react';
import { CHAT_PANEL_CLASS } from '@/lib/chat/layout';
import { getSupabaseClient } from '@/lib/supabase';
import { ChatView } from '@/components/chat';
import { deleteCliqueRpc, leaveCliqueRpc } from '@/lib/chat/createVerifiedClick';
import type { ChatSearchHit } from '@/lib/chat/searchSnippet';
import type { ConnectionRecord } from '@/components/dashboard/ConnectionTable';
import { ConnectionPeerAvatar } from '@/components/dashboard/ConnectionPeerAvatar';
import type { Message } from '@/lib/chat/types';
import {
  connectionRecordToArchiveRow,
  formatArchiveCountdownLabel,
  getArchiveCountdown,
  shouldShowArchiveWarning,
} from '@/lib/dashboard/connectionStatus';

type ChatListConnection = ConnectionRecord & {
  chatPreview: string | null;
  chatLastMessageAt: number | null;
  chatUpdatedAt: number | null;
};

/**
 * The dashboard's Chat tab: either the open conversation (ChatView) or the
 * searchable Active/Archived chat list with per-row action menus. Extracted
 * verbatim from DashboardView.
 */
export function ChatTabSection({
  user,
  onlineUserIds,
  selectedConnection,
  setSelectedConnection,
  targetMessageId,
  setTargetMessageId,
  connectionRecords,
  groupCliqueRecords,
  archivedConnectionIds,
  blockedUserIds,
  coreConnectionIds,
  activeConnections,
  archivedConnections,
  visibleChatConnections,
  chatListTab,
  setChatListTab,
  chatSearchQuery,
  setChatSearchQuery,
  chatSearchBusy,
  chatSearchHits,
  handleOpenChat,
  formatChatActivity,
  menuConnectionId,
  setMenuConnectionId,
  openActionMenu,
  suppressClickConnectionId,
  setSuppressClickConnectionId,
  startLongPress,
  endLongPress,
  addConnectionToCore,
  removeConnectionFromCore,
  archiveConnection,
  unarchiveConnection,
  removeConnection,
  reportConnection,
  blockUser,
  unblockUser,
  startOutgoingCall,
  setCreateClickOpen,
  setProfileUserId,
  setProfileConnectionId,
  setGroupClicksReloadNonce,
  setChatMessagesSnapshot,
  groupMemberPickerBusy,
  openVerifiedCliqueMemberPicker,
  selectedConnectionRef,
  setChatListGroupRenameGroupId,
  setChatListGroupRenameInput,
  chatListGroupActionBusyId,
  setChatListGroupActionBusyId,
}: {
  user: any;
  onlineUserIds: ReadonlySet<string>;
  selectedConnection: ConnectionRecord | null;
  setSelectedConnection: Dispatch<SetStateAction<ConnectionRecord | null>>;
  targetMessageId: string | null;
  setTargetMessageId: Dispatch<SetStateAction<string | null>>;
  connectionRecords: ConnectionRecord[];
  groupCliqueRecords: ConnectionRecord[];
  archivedConnectionIds: Set<string>;
  blockedUserIds: Set<string>;
  coreConnectionIds: Set<string>;
  activeConnections: ChatListConnection[];
  archivedConnections: ChatListConnection[];
  visibleChatConnections: ChatListConnection[];
  chatListTab: 'active' | 'archived';
  setChatListTab: Dispatch<SetStateAction<'active' | 'archived'>>;
  chatSearchQuery: string;
  setChatSearchQuery: Dispatch<SetStateAction<string>>;
  chatSearchBusy: boolean;
  chatSearchHits: ChatSearchHit[];
  handleOpenChat: (conn: ConnectionRecord, messageId?: string | null) => void;
  formatChatActivity: (timestamp?: number | null) => string | null;
  menuConnectionId: string | null;
  setMenuConnectionId: Dispatch<SetStateAction<string | null>>;
  openActionMenu: (connectionId: string) => void;
  suppressClickConnectionId: string | null;
  setSuppressClickConnectionId: Dispatch<SetStateAction<string | null>>;
  startLongPress: (connectionId: string) => void;
  endLongPress: () => void;
  addConnectionToCore: (connectionId: string) => Promise<boolean>;
  removeConnectionFromCore: (connectionId: string) => Promise<boolean>;
  archiveConnection: (connectionId: string) => Promise<boolean>;
  unarchiveConnection: (connectionId: string) => Promise<boolean>;
  removeConnection: (connectionId: string) => Promise<boolean>;
  reportConnection: (connectionId: string, reason: string) => Promise<boolean>;
  blockUser: (connection: ConnectionRecord) => Promise<boolean>;
  unblockUser: (connection: ConnectionRecord) => Promise<boolean>;
  startOutgoingCall: (connection: ConnectionRecord, videoEnabled: boolean) => Promise<void>;
  setCreateClickOpen: Dispatch<SetStateAction<boolean>>;
  setProfileUserId: Dispatch<SetStateAction<string | null>>;
  setProfileConnectionId: Dispatch<SetStateAction<string | null>>;
  setGroupClicksReloadNonce: Dispatch<SetStateAction<number>>;
  setChatMessagesSnapshot: Dispatch<SetStateAction<Message[]>>;
  groupMemberPickerBusy: boolean;
  openVerifiedCliqueMemberPicker: (memberUserIds: string[]) => Promise<void>;
  selectedConnectionRef: MutableRefObject<ConnectionRecord | null>;
  setChatListGroupRenameGroupId: Dispatch<SetStateAction<string | null>>;
  setChatListGroupRenameInput: Dispatch<SetStateAction<string>>;
  chatListGroupActionBusyId: string | null;
  setChatListGroupActionBusyId: Dispatch<SetStateAction<string | null>>;
}) {
  return (
    <div className="h-full min-h-0">
    <AnimatePresence mode="wait" initial={false}>
      {selectedConnection ? (
        <motion.div
          key={selectedConnection.id}
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 24 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          className="flex h-full min-h-0 flex-col overflow-hidden"
        >
          <ChatView
            connection={selectedConnection}
            currentUserId={user.id}
            otherUserName={selectedConnection.name}
            isArchived={
              archivedConnectionIds.has(selectedConnection.id) ||
              selectedConnection.status === 'archived'
            }
            isBlocked={selectedConnection.otherUserId ? blockedUserIds.has(selectedConnection.otherUserId) : false}
            isCore={coreConnectionIds.has(selectedConnection.id)}
            onAddToCore={() => addConnectionToCore(selectedConnection.id)}
            onRemoveFromCore={() => removeConnectionFromCore(selectedConnection.id)}
            onArchive={() => archiveConnection(selectedConnection.id)}
            onUnarchive={() => unarchiveConnection(selectedConnection.id)}
            onRemove={() => removeConnection(selectedConnection.id)}
            onReport={(reason) => reportConnection(selectedConnection.id, reason)}
            onBlock={() => blockUser(selectedConnection)}
            onUnblock={() => unblockUser(selectedConnection)}
            onStartCall={(videoEnabled) => startOutgoingCall(selectedConnection, videoEnabled)}
            onClose={() => {
              setSelectedConnection(null);
              setTargetMessageId(null);
            }}
            onOpenProfile={(id) => {
              setProfileConnectionId(selectedConnection?.id ?? null);
              setProfileUserId(id);
            }}
            onGroupChatChanged={() => {
              setGroupClicksReloadNonce((n) => n + 1);
            }}
            onMessagesSnapshot={setChatMessagesSnapshot}
            targetMessageId={targetMessageId}
          />
        </motion.div>
      ) : (
        <motion.div
          key="chat-list"
          initial={{ opacity: 0, x: -24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -24 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          className={`${CHAT_PANEL_CLASS} chat-thread-scroll`}
        >
        <div className="space-y-6 p-4 md:p-6">
        <div className="flex w-full items-center gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="p-2 bg-primary/20 rounded-xl">
              <MessageCircle className="w-5 h-5 text-primary" />
            </div>
            <div className="min-w-0">
              <h2 className="text-xl font-bold">Messages</h2>
              <p className="text-sm text-on-surface-variant">Chat with your Clicks</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setCreateClickOpen(true)}
            className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-border-hard bg-surface-container/70 px-3 py-2 text-xs font-semibold text-on-surface hover:bg-surface-container/80"
          >
            <Users className="h-4 w-4" />
            New click
          </button>
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-variant" />
          <input
            type="search"
            value={chatSearchQuery}
            onChange={(e) => setChatSearchQuery(e.target.value)}
            placeholder="Search messages in your chats…"
            className="w-full rounded-xl border border-border-hard bg-surface-container/50 py-3 pl-10 pr-4 text-sm text-on-surface focus:border-primary focus:outline-none"
            aria-label="Search messages"
          />
        </div>
        {chatSearchQuery.trim().length >= 2 ? (
          <div className="fc-card overflow-hidden rounded-[16px] border border-border-hard">
            <div className="border-b border-border-hard px-4 py-2 text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
              {chatSearchBusy ? 'Searching messages…' : `Message matches (${chatSearchHits.length})`}
            </div>
            {chatSearchHits.length === 0 && !chatSearchBusy ? (
              <p className="px-4 py-6 text-sm text-on-surface-variant">
                No messages matched “{chatSearchQuery.trim()}”.
              </p>
            ) : (
              <ul className="divide-y divide-border-hard/70">
                {chatSearchHits.map((hit) => (
                  <li key={hit.messageId}>
                    <button
                      type="button"
                      className="flex w-full flex-col items-start gap-0.5 rounded-xl px-4 py-3 text-left hover:bg-surface-container/60"
                      onClick={() => {
                        const conn = [...connectionRecords, ...groupCliqueRecords].find(
                          (c) =>
                            c.id === hit.connectionId ||
                            c.id === hit.conversationId ||
                            c.groupChatId === hit.chatId,
                        );
                        if (!conn) return;
                        handleOpenChat(conn, hit.messageId);
                      }}
                    >
                      <span className="w-full truncate text-sm font-semibold text-on-surface" title={hit.chatName}>{hit.chatName}</span>
                      <span className="line-clamp-2 text-sm text-on-surface-variant">{hit.snippet}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}

        <div className="inline-flex items-center gap-1.5 rounded-2xl border border-border-hard/80 bg-surface-container/70 p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
          <motion.button
            onClick={() => setChatListTab('active')}
            whileTap={{ scale: 0.985 }}
            className={`relative px-4 py-2 rounded-xl text-sm transition-colors duration-200 ${
              chatListTab === 'active'
                ? 'text-on-surface'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            {chatListTab === 'active' ? (
              <motion.span
                layoutId="chatListTabPill"
                className="absolute inset-0 rounded-xl border border-primary/35 bg-[linear-gradient(135deg,rgba(124,58,237,0.28),rgba(124,58,237,0.12))] shadow-[0_0_0_1px_rgba(255,255,255,0.02),0_10px_30px_rgba(124,58,237,0.16)]"
                transition={{ type: 'spring', stiffness: 380, damping: 32 }}
              />
            ) : null}
            <span className="relative z-10 flex items-center gap-2">
              <span>Active</span>
              <span className={`rounded-full px-2 py-0.5 text-[11px] ${chatListTab === 'active' ? 'bg-white/12 text-on-surface' : 'bg-surface-container text-on-surface-variant'}`}>
                {activeConnections.length}
              </span>
            </span>
          </motion.button>
          <motion.button
            onClick={() => setChatListTab('archived')}
            whileTap={{ scale: 0.985 }}
            className={`relative px-4 py-2 rounded-xl text-sm transition-colors duration-200 ${
              chatListTab === 'archived'
                ? 'text-on-surface'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            {chatListTab === 'archived' ? (
              <motion.span
                layoutId="chatListTabPill"
                className="absolute inset-0 rounded-xl border border-border-hard bg-primary/15"
                transition={{ type: 'spring', stiffness: 380, damping: 32 }}
              />
            ) : null}
            <span className="relative z-10 flex items-center gap-2">
              <span>Archived</span>
              <span className={`rounded-full px-2 py-0.5 text-[11px] ${chatListTab === 'archived' ? 'bg-surface-container text-on-surface' : 'bg-surface-container text-on-surface-variant'}`}>
                {archivedConnections.length}
              </span>
            </span>
          </motion.button>
        </div>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={chatListTab}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          >
            {visibleChatConnections.length === 0 ? (
              <div className="fc-card rounded-[16px] border border-border-hard p-12 text-center">
                <MessageCircle className="mx-auto mb-4 h-16 w-16 text-outline" />
                <h3 className="mb-2 text-xl font-semibold">
                  {chatListTab === 'active' ? 'No Active Conversations' : 'No Archived Conversations'}
                </h3>
                <p className="text-on-surface-variant">
                  {chatListTab === 'active'
                    ? 'Start meeting people and your chats will appear here!'
                    : 'Auto-archived chats and conversations you moved to Archived appear here. Tap Restore to move them back to Active.'}
                </p>
              </div>
            ) : (
              <div className="overflow-visible rounded-[12px] border border-border-hard divide-y divide-border-hard">
                {visibleChatConnections.map((conn: ConnectionRecord, index) => {
                  const isUserArchived = archivedConnectionIds.has(conn.id);
                  const isServerArchived = conn.status === 'archived';
                  const isArchived = isUserArchived || isServerArchived;
                  const previewText = conn.chatPreview?.trim() || 'No messages yet';
                  const activityLabel = formatChatActivity(conn.chatLastMessageAt ?? conn.chatUpdatedAt);
                  const archiveRow = connectionRecordToArchiveRow(conn);
                  const archiveInfo = getArchiveCountdown(archiveRow, Date.now());
                  const archiveWarning =
                    archiveInfo && shouldShowArchiveWarning(archiveInfo)
                      ? formatArchiveCountdownLabel(archiveInfo)
                      : null;
                  const menuOpensUpward = index >= visibleChatConnections.length - 2;
                  const isGroupCliqueRow = conn.chatKind === 'group_clique';
                  const groupMemberIds = conn.userIds ?? [];
                  const listPeerId =
                    conn.otherUserId ??
                    (user?.id ? conn.userIds?.find((id) => id !== user.id) : undefined);
                  const listPeerOnline = !!(listPeerId && onlineUserIds.has(listPeerId));
                  return (
                    <div key={conn.id} className="relative">
                      <motion.div
                        role="button"
                        tabIndex={0}
                        whileHover={{ backgroundColor: 'rgba(124, 58, 237, 0.05)' }}
                        whileTap={{ scale: 0.995 }}
                        onClick={() => {
                          if (suppressClickConnectionId === conn.id) {
                            setSuppressClickConnectionId(null);
                            return;
                          }
                          setSelectedConnection(conn);
                        }}
                        onKeyDown={(e) => {
                          if (e.key !== 'Enter' && e.key !== ' ') return;
                          e.preventDefault();
                          if (suppressClickConnectionId === conn.id) {
                            setSuppressClickConnectionId(null);
                            return;
                          }
                          setSelectedConnection(conn);
                        }}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setMenuConnectionId(conn.id);
                        }}
                        onTouchStart={() => startLongPress(conn.id)}
                        onTouchEnd={endLongPress}
                        onTouchCancel={endLongPress}
                        className="flex w-full cursor-pointer items-start gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-surface-container/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 md:px-4"
                      >
                        {isGroupCliqueRow ? (
                          <button
                            type="button"
                            disabled={groupMemberPickerBusy || groupMemberIds.length === 0}
                            onClick={(e) => {
                              e.stopPropagation();
                              void openVerifiedCliqueMemberPicker(groupMemberIds);
                            }}
                            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-on-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-40"
                            aria-label="View verified clique members"
                          >
                            <Users className="h-5 w-5" aria-hidden />
                          </button>
                        ) : listPeerId ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setProfileConnectionId(conn.id);
                              setProfileUserId(listPeerId);
                            }}
                            className="shrink-0 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                            aria-label={`View ${conn.name}'s profile`}
                          >
                            <ConnectionPeerAvatar
                              label={conn.name}
                              imageUrl={conn.avatarUrl}
                              size="md"
                              showOnline={listPeerOnline}
                              isCore={coreConnectionIds.has(conn.id)}
                            />
                          </button>
                        ) : (
                          <div className="shrink-0">
                            <ConnectionPeerAvatar
                              label={conn.name}
                              imageUrl={conn.avatarUrl}
                              size="md"
                              showOnline={false}
                              isCore={coreConnectionIds.has(conn.id)}
                            />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex min-w-0 items-center gap-2">
                            <p className="min-w-0 truncate font-semibold text-on-surface" title={conn.name}>{conn.name}</p>
                            {!isGroupCliqueRow && conn.intentOverlapLabel ? (
                              <span
                                className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-amber-400/35 bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:text-amber-300"
                                title={`Vibes match: ${conn.intentOverlapLabel}`}
                              >
                                <Zap className="h-3 w-3" aria-hidden />
                              </span>
                            ) : null}
                            {isArchived ? (
                              <span className="shrink-0 rounded-full border border-border-hard bg-surface-container px-2 py-0.5 text-[10px] text-on-surface-variant">
                                {isServerArchived ? 'Auto-archived' : 'Archived'}
                              </span>
                            ) : null}
                            {activityLabel ? (
                              <span className="ml-auto shrink-0 text-[11px] text-on-surface-variant">
                                {activityLabel}
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-0.5 truncate text-sm text-on-surface-variant" title={previewText}>
                            {previewText}
                          </p>
                          <p className="mt-1 truncate text-xs text-on-surface-variant" title={conn.location}>
                            {conn.location}
                          </p>
                          {(() => {
                            const latest = conn.encounters?.[0];
                            if (!latest) return null;
                            const db =
                              latest.exactNoiseLevelDb !== null &&
                              latest.exactNoiseLevelDb !== undefined &&
                              typeof latest.exactNoiseLevelDb === 'number' &&
                              Number.isFinite(latest.exactNoiseLevelDb)
                                ? latest.exactNoiseLevelDb
                                : null;
                            const el =
                              latest.relativeAltitudeM !== null &&
                              latest.relativeAltitudeM !== undefined &&
                              typeof latest.relativeAltitudeM === 'number' &&
                              Number.isFinite(latest.relativeAltitudeM)
                                ? latest.relativeAltitudeM
                                : latest.exactBarometricElevationM !== null &&
                                    latest.exactBarometricElevationM !== undefined &&
                                    typeof latest.exactBarometricElevationM === 'number' &&
                                    Number.isFinite(latest.exactBarometricElevationM)
                                  ? latest.exactBarometricElevationM
                                  : null;
                            if (db === null && el === null) return null;
                            return (
                              <div className="mt-1.5 flex flex-wrap gap-1">
                                {db !== null ? (
                                  <span className="inline-flex items-center gap-0.5 rounded-full border border-border-hard/80 bg-surface px-1.5 py-0.5 text-[10px] font-medium text-on-surface">
                                    <Volume2 className="h-3 w-3 shrink-0 text-primary" aria-hidden />
                                    {Math.round(db)} dB
                                  </span>
                                ) : null}
                                {el !== null ? (
                                  <span className="inline-flex items-center gap-0.5 rounded-full border border-border-hard/80 bg-surface px-1.5 py-0.5 text-[10px] font-medium text-on-surface">
                                    <Mountain className="h-3 w-3 shrink-0 text-sky-300" aria-hidden />
                                    {Math.round(el)} m
                                  </span>
                                ) : null}
                              </div>
                            );
                          })()}
                          {archiveWarning && !isGroupCliqueRow && !isServerArchived && !isUserArchived ? (
                            <p
                              className={`mt-1.5 flex items-center gap-1 truncate text-[11px] ${
                                archiveInfo?.isUrgent ? 'text-amber-800 dark:text-amber-300' : 'text-on-surface-variant'
                              }`}
                            >
                              <Clock className="h-3 w-3 shrink-0" aria-hidden />
                              <span className="truncate">{archiveWarning}</span>
                            </p>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openActionMenu(conn.id);
                          }}
                          data-connection-menu-trigger
                          className="shrink-0 rounded-lg p-1.5 text-on-surface-variant hover:bg-surface-container/70 hover:text-on-surface"
                          aria-label={`Open actions for ${conn.name}`}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </button>
                      </motion.div>

                      {menuConnectionId === conn.id && (
                        <div
                          data-connection-menu
                          className={`absolute right-4 z-50 min-w-[160px] overflow-hidden rounded-xl border border-border-hard bg-surface-container shadow-xl ${menuOpensUpward ? 'bottom-[calc(50%+1.8rem)]' : 'top-[calc(50%+1.8rem)]'}`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedConnection(conn);
                              setMenuConnectionId(null);
                            }}
                            className="w-full text-left px-3 py-2 text-sm text-on-surface hover:bg-surface-container"
                          >
                            Open chat
                          </button>
                          {isGroupCliqueRow ? (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  setChatListGroupRenameGroupId(conn.id);
                                  setChatListGroupRenameInput(conn.name);
                                  setMenuConnectionId(null);
                                }}
                                className="w-full text-left px-3 py-2 text-sm text-on-surface hover:bg-surface-container"
                              >
                                Edit group name
                              </button>
                              <button
                                type="button"
                                disabled={chatListGroupActionBusyId === conn.id}
                                onClick={async () => {
                                  if (
                                    !window.confirm(
                                      'Leave this verified clique? You will stop receiving messages in this group.',
                                    )
                                  ) {
                                    return;
                                  }
                                  const supabase = getSupabaseClient();
                                  if (!supabase) {
                                    window.alert('Sign in required.');
                                    return;
                                  }
                                  setChatListGroupActionBusyId(conn.id);
                                  try {
                                    await leaveCliqueRpc(supabase, conn.id);
                                    if (selectedConnectionRef.current?.id === conn.id) {
                                      setSelectedConnection(null);
                                    }
                                    setGroupClicksReloadNonce((n) => n + 1);
                                    setMenuConnectionId(null);
                                  } catch (e) {
                                    window.alert(
                                      e instanceof Error ? e.message : 'Could not leave group',
                                    );
                                  } finally {
                                    setChatListGroupActionBusyId(null);
                                  }
                                }}
                                className="w-full text-left px-3 py-2 text-sm text-on-surface-variant hover:bg-surface-container disabled:opacity-40"
                              >
                                Leave group
                              </button>
                              {user?.id === conn.groupCreatedByUserId ? (
                                <button
                                  type="button"
                                  disabled={chatListGroupActionBusyId === conn.id}
                                  onClick={async () => {
                                    if (
                                      !window.confirm(
                                        'Delete this verified clique for everyone? All messages will be removed. This cannot be undone.',
                                      )
                                    ) {
                                      return;
                                    }
                                    const supabase = getSupabaseClient();
                                    if (!supabase) {
                                      window.alert('Sign in required.');
                                      return;
                                    }
                                    setChatListGroupActionBusyId(conn.id);
                                    try {
                                      await deleteCliqueRpc(supabase, conn.id);
                                      if (selectedConnectionRef.current?.id === conn.id) {
                                        setSelectedConnection(null);
                                      }
                                      setGroupClicksReloadNonce((n) => n + 1);
                                      setMenuConnectionId(null);
                                    } catch (e) {
                                      window.alert(
                                        e instanceof Error ? e.message : 'Could not delete group',
                                      );
                                    } finally {
                                      setChatListGroupActionBusyId(null);
                                    }
                                  }}
                                  className="w-full text-left px-3 py-2 text-sm text-red-700 dark:text-red-400 hover:bg-surface-container disabled:opacity-40"
                                >
                                  Delete group
                                </button>
                              ) : null}
                            </>
                          ) : (
                            <>
                              {coreConnectionIds.has(conn.id) ? (
                                <button
                                  type="button"
                                  onClick={() => removeConnectionFromCore(conn.id)}
                                  className="w-full text-left px-3 py-2 text-sm text-primary hover:bg-surface-container"
                                >
                                  Remove from Core
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => addConnectionToCore(conn.id)}
                                  className="w-full text-left px-3 py-2 text-sm text-primary hover:bg-surface-container"
                                >
                                  Add to Core
                                </button>
                              )}
                              {isArchived ? (
                                <button
                                  type="button"
                                  onClick={() => unarchiveConnection(conn.id)}
                                  className="w-full text-left px-3 py-2 text-sm text-primary hover:bg-surface-container"
                                >
                                  {isServerArchived ? 'Restore' : 'Unarchive'}
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => archiveConnection(conn.id)}
                                  className="w-full text-left px-3 py-2 text-sm text-on-surface-variant hover:bg-surface-container"
                                >
                                  Archive
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={async () => {
                                  const reason = window.prompt('Report reason');
                                  if (!reason) return;
                                  if (!window.confirm('Submit this report for moderation review?')) return;
                                  await reportConnection(conn.id, reason);
                                  setMenuConnectionId(null);
                                }}
                                className="w-full text-left px-3 py-2 text-sm text-amber-800 dark:text-amber-300 hover:bg-surface-container"
                              >
                                Report
                              </button>
                              {conn.otherUserId && blockedUserIds.has(conn.otherUserId) ? (
                                <button
                                  type="button"
                                  onClick={async () => {
                                    await unblockUser(conn);
                                    setMenuConnectionId(null);
                                  }}
                                  className="w-full text-left px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300 hover:bg-surface-container"
                                >
                                  Unblock
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={async () => {
                                    if (!window.confirm(`Block ${conn.name} and remove this connection?`)) return;
                                    await blockUser(conn);
                                    setMenuConnectionId(null);
                                  }}
                                  className="w-full text-left px-3 py-2 text-sm text-orange-700 dark:text-orange-300 hover:bg-surface-container"
                                >
                                  Block
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={async () => {
                                  if (!window.confirm(`Remove your connection with ${conn.name}?`)) return;
                                  await removeConnection(conn.id);
                                  setMenuConnectionId(null);
                                }}
                                className="w-full text-left px-3 py-2 text-sm text-red-700 dark:text-red-400 hover:bg-surface-container"
                              >
                                Remove connection
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
        </div>
        </motion.div>
      )}
    </AnimatePresence>
    </div>
  );
}
