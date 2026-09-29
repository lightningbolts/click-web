'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { BellOff, Clock, MessageCircle, MoreHorizontal, Search, Users, Zap } from 'lucide-react';
import type { ConnectionRecord } from '@/components/dashboard/ConnectionTable';
import { ConnectionPeerAvatar } from '@/components/dashboard/ConnectionPeerAvatar';
import type { ChatSearchHit } from '@/lib/chat/searchSnippet';
import { MUTE_OPTIONS, type ChatMute } from '@/lib/chat/conversationApi';
import {
  connectionRecordToArchiveRow,
  formatArchiveCountdownLabel,
  getArchiveCountdown,
  shouldShowArchiveWarning,
} from '@/lib/dashboard/connectionStatus';
import { cn } from '@/lib/cn';

export type ChatListConnection = ConnectionRecord & {
  chatPreview: string | null;
  chatLastMessageAt: number | null;
  chatUpdatedAt: number | null;
  chatUnreadCount?: number;
  chatId?: string | null;
};

export type ConversationRowActions = {
  open: (conn: ChatListConnection) => void;
  openProfile: (conn: ChatListConnection, peerId: string) => void;
  openMembers: (conn: ChatListConnection) => void;
  setMuted: (conn: ChatListConnection, muted: boolean, durationMs: number | null) => void;
  addToCore: (id: string) => void;
  removeFromCore: (id: string) => void;
  archive: (id: string) => void;
  unarchive: (id: string) => void;
  report: (conn: ChatListConnection) => void;
  block: (conn: ChatListConnection) => void;
  unblock: (conn: ChatListConnection) => void;
  remove: (conn: ChatListConnection) => void;
  renameGroup: (conn: ChatListConnection) => void;
  leaveGroup: (conn: ChatListConnection) => void;
  deleteGroup: (conn: ChatListConnection) => void;
};

const menuItem =
  'flex w-full items-center gap-2 rounded-[8px] px-3 py-2 text-left text-sm font-semibold text-on-surface hover:bg-surface-container-low disabled:opacity-40';

function RowMenu({
  conn,
  isArchived,
  isServerArchived,
  isCore,
  isBlocked,
  muted,
  isGroupCreator,
  busy,
  actions,
  onClose,
}: {
  conn: ChatListConnection;
  isArchived: boolean;
  isServerArchived: boolean;
  isCore: boolean;
  isBlocked: boolean;
  muted: boolean;
  isGroupCreator: boolean;
  busy: boolean;
  actions: ConversationRowActions;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [muteOpen, setMuteOpen] = useState(false);
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  const act = (fn: () => void) => () => {
    fn();
    onClose();
  };
  const isGroup = conn.chatKind === 'group_clique';

  return (
    <div
      ref={ref}
      role="menu"
      data-connection-menu
      className="absolute right-2 top-[calc(100%-0.5rem)] z-50 w-56 rounded-[12px] border border-border-hard bg-surface p-1.5 shadow-xl"
      onClick={(e) => e.stopPropagation()}
    >
      {muted ? (
        <button type="button" role="menuitem" className={menuItem} onClick={act(() => actions.setMuted(conn, false, null))}>
          Unmute
        </button>
      ) : (
        <>
          <button
            type="button"
            role="menuitem"
            aria-expanded={muteOpen}
            className={menuItem}
            onClick={() => setMuteOpen((o) => !o)}
          >
            Mute notifications…
          </button>
          {muteOpen
            ? MUTE_OPTIONS.map((option) => (
                <button
                  key={option.label}
                  type="button"
                  role="menuitem"
                  className={cn(menuItem, 'pl-6 font-medium')}
                  onClick={act(() => actions.setMuted(conn, true, option.ms))}
                >
                  {option.label}
                </button>
              ))
            : null}
        </>
      )}
      <div className="my-1 border-t border-border-hard" />
      {isGroup ? (
        <>
          <button type="button" role="menuitem" className={menuItem} onClick={act(() => actions.renameGroup(conn))}>
            Edit group name
          </button>
          <button type="button" role="menuitem" disabled={busy} className={menuItem} onClick={act(() => actions.leaveGroup(conn))}>
            Leave group
          </button>
          {isGroupCreator ? (
            <button
              type="button"
              role="menuitem"
              disabled={busy}
              className={cn(menuItem, 'text-error')}
              onClick={act(() => actions.deleteGroup(conn))}
            >
              Delete group
            </button>
          ) : null}
        </>
      ) : (
        <>
          <button
            type="button"
            role="menuitem"
            className={menuItem}
            onClick={act(() => (isCore ? actions.removeFromCore(conn.id) : actions.addToCore(conn.id)))}
          >
            {isCore ? 'Remove from Core' : 'Add to Core'}
          </button>
          <button
            type="button"
            role="menuitem"
            className={menuItem}
            onClick={act(() => (isArchived ? actions.unarchive(conn.id) : actions.archive(conn.id)))}
          >
            {isArchived ? (isServerArchived ? 'Restore' : 'Unarchive') : 'Archive'}
          </button>
          <div className="my-1 border-t border-border-hard" />
          <button type="button" role="menuitem" className={menuItem} onClick={act(() => actions.report(conn))}>
            Report
          </button>
          <button
            type="button"
            role="menuitem"
            className={menuItem}
            onClick={act(() => (isBlocked ? actions.unblock(conn) : actions.block(conn)))}
          >
            {isBlocked ? 'Unblock' : 'Block'}
          </button>
          <button type="button" role="menuitem" className={cn(menuItem, 'text-error')} onClick={act(() => actions.remove(conn))}>
            Remove connection
          </button>
        </>
      )}
    </div>
  );
}

/**
 * The inbox column: search (people and message text), Active/Archived, and conversation rows
 * with unread counts, mute state, and the 48-hour archive countdown. Row menus carry the same
 * actions as iOS `ConversationActions`.
 */
export function ConversationList({
  viewerId,
  connections,
  activeCount,
  archivedCount,
  listTab,
  onListTabChange,
  selectedId,
  onlineUserIds,
  coreConnectionIds,
  archivedConnectionIds,
  blockedUserIds,
  muteFor,
  searchQuery,
  onSearchQueryChange,
  searchBusy,
  searchHits,
  onOpenSearchHit,
  formatActivity,
  menuConnectionId,
  setMenuConnectionId,
  busyGroupId,
  actions,
  headerAction,
}: {
  viewerId: string;
  connections: ChatListConnection[];
  activeCount: number;
  archivedCount: number;
  listTab: 'active' | 'archived';
  onListTabChange: (tab: 'active' | 'archived') => void;
  selectedId: string | null;
  onlineUserIds: ReadonlySet<string>;
  coreConnectionIds: Set<string>;
  archivedConnectionIds: Set<string>;
  blockedUserIds: Set<string>;
  muteFor: (ids: readonly (string | null | undefined)[]) => ChatMute | null;
  searchQuery: string;
  onSearchQueryChange: (q: string) => void;
  searchBusy: boolean;
  searchHits: ChatSearchHit[];
  onOpenSearchHit: (hit: ChatSearchHit) => void;
  formatActivity: (timestamp?: number | null) => string | null;
  menuConnectionId: string | null;
  setMenuConnectionId: (id: string | null) => void;
  busyGroupId: string | null;
  actions: ConversationRowActions;
  headerAction?: ReactNode;
}) {
  // Archive countdowns tick by the minute; read the clock in state, not during render.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  const query = searchQuery.trim().toLowerCase();
  const nameMatches = query
    ? connections.filter((c) => c.name.toLowerCase().includes(query) || c.location?.toLowerCase().includes(query))
    : connections;

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="conversation-list">
      <div className="shrink-0 space-y-3 border-b border-border-hard p-3 md:p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-bold text-on-surface">Messages</h2>
          {headerAction}
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-variant" aria-hidden />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => onSearchQueryChange(e.target.value)}
            placeholder="Search people and messages"
            className="fc-input h-10 w-full py-2 pl-9 pr-3 text-sm"
            aria-label="Search people and messages"
          />
        </div>
        <div className="grid grid-cols-2 gap-1 rounded-[10px] bg-surface-container-low p-1" role="tablist" aria-label="Conversation lists">
          {(['active', 'archived'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={listTab === tab}
              onClick={() => onListTabChange(tab)}
              className={cn(
                'inline-flex h-8 items-center justify-center gap-1.5 rounded-[8px] text-sm font-semibold transition-colors',
                listTab === tab ? 'bg-surface text-on-surface shadow-sm' : 'text-on-surface-variant hover:text-on-surface',
              )}
            >
              {tab === 'active' ? 'Active' : 'Archived'}
              <span className="text-xs font-medium text-on-surface-variant">{tab === 'active' ? activeCount : archivedCount}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="chat-thread-scroll min-h-0 flex-1">
        {query.length >= 2 ? (
          <div className="border-b border-border-hard">
            <p className="px-4 pb-1 pt-3 text-xs font-bold uppercase tracking-wide text-on-surface-variant">
              {searchBusy ? 'Searching messages…' : `Messages (${searchHits.length})`}
            </p>
            {searchHits.length === 0 && !searchBusy ? (
              <p className="px-4 pb-3 text-sm text-on-surface-variant">No messages matched.</p>
            ) : (
              <ul className="px-1.5 pb-2">
                {searchHits.map((hit) => (
                  <li key={hit.messageId}>
                    <button
                      type="button"
                      className="flex w-full flex-col items-start gap-0.5 rounded-[8px] px-2.5 py-2 text-left hover:bg-surface-container-low"
                      onClick={() => onOpenSearchHit(hit)}
                    >
                      <span className="w-full truncate text-sm font-semibold text-on-surface">{hit.chatName}</span>
                      <span className="line-clamp-2 text-sm text-on-surface-variant">{hit.snippet}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="px-4 pb-1 pt-2 text-xs font-bold uppercase tracking-wide text-on-surface-variant">People</p>
          </div>
        ) : null}

        {nameMatches.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-14 text-center">
            <MessageCircle className="mb-3 h-10 w-10 text-outline" aria-hidden />
            <p className="font-semibold text-on-surface">
              {query ? 'No one matches that search' : listTab === 'active' ? 'No conversations yet' : 'No archived conversations'}
            </p>
            <p className="mt-1 max-w-xs text-sm text-on-surface-variant">
              {query
                ? 'Try a name or a place you met.'
                : listTab === 'active'
                  ? 'Meet someone in person and your chat appears here.'
                  : 'Auto-archived chats and conversations you moved to Archived appear here.'}
            </p>
          </div>
        ) : (
          <ul className="p-1.5">
            {nameMatches.map((conn) => {
              const isGroup = conn.chatKind === 'group_clique';
              const isServerArchived = conn.status === 'archived';
              const isArchived = isServerArchived || archivedConnectionIds.has(conn.id);
              const peerId = conn.otherUserId ?? conn.userIds?.find((id) => id !== viewerId);
              const online = Boolean(peerId && onlineUserIds.has(peerId));
              const unread = conn.chatUnreadCount ?? 0;
              const muted = Boolean(muteFor([conn.chatId, conn.id]));
              const selected = selectedId === conn.id;
              const activity = formatActivity(conn.chatLastMessageAt ?? conn.chatUpdatedAt);
              const archiveInfo = getArchiveCountdown(connectionRecordToArchiveRow(conn), now);
              const archiveWarning =
                !isGroup && !isArchived && archiveInfo && shouldShowArchiveWarning(archiveInfo)
                  ? formatArchiveCountdownLabel(archiveInfo)
                  : null;
              const preview = conn.chatPreview?.trim() || (conn.location ? `Met at ${conn.location}` : 'Say hi');
              return (
                <li key={conn.id} className="relative">
                  <div
                    role="button"
                    tabIndex={0}
                    aria-current={selected ? 'true' : undefined}
                    data-testid={`conversation-row-${conn.id}`}
                    onClick={() => actions.open(conn)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        actions.open(conn);
                      }
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setMenuConnectionId(conn.id);
                    }}
                    className={cn(
                      'group flex w-full cursor-pointer items-center gap-3 rounded-[12px] px-2.5 py-2.5 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                      selected ? 'bg-primary-container' : 'hover:bg-surface-container-low',
                    )}
                  >
                    {isGroup ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          actions.openMembers(conn);
                        }}
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-on-primary"
                        aria-label={`View ${conn.name} members`}
                      >
                        <Users className="h-5 w-5" aria-hidden />
                      </button>
                    ) : peerId ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          actions.openProfile(conn, peerId);
                        }}
                        className="shrink-0 rounded-full"
                        aria-label={`View ${conn.name}'s profile`}
                      >
                        <ConnectionPeerAvatar
                          label={conn.name}
                          imageUrl={conn.avatarUrl}
                          size="lg"
                          showOnline={online}
                          isCore={coreConnectionIds.has(conn.id)}
                        />
                      </button>
                    ) : (
                      <ConnectionPeerAvatar label={conn.name} imageUrl={conn.avatarUrl} size="lg" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <p
                          className={cn(
                            'min-w-0 truncate text-[15px] text-on-surface',
                            unread > 0 ? 'font-bold' : 'font-semibold',
                          )}
                          title={conn.name}
                        >
                          {conn.name}
                        </p>
                        {!isGroup && conn.intentOverlapLabel ? (
                          <Zap className="h-3.5 w-3.5 shrink-0 text-primary" aria-label={`Both free: ${conn.intentOverlapLabel}`} />
                        ) : null}
                        {muted ? <BellOff className="h-3.5 w-3.5 shrink-0 text-on-surface-variant" aria-label="Muted" /> : null}
                        {activity ? (
                          <span className={cn('ml-auto shrink-0 text-xs', unread > 0 ? 'font-bold text-primary' : 'text-on-surface-variant')}>
                            {activity}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-0.5 flex min-w-0 items-center gap-2">
                        <p
                          className={cn(
                            'min-w-0 flex-1 truncate text-sm',
                            unread > 0 ? 'font-semibold text-on-surface' : 'text-on-surface-variant',
                          )}
                          title={preview}
                        >
                          {preview}
                        </p>
                        {unread > 0 ? (
                          <span
                            className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-bold text-on-primary"
                            aria-label={`${unread} unread`}
                          >
                            {unread > 99 ? '99+' : unread}
                          </span>
                        ) : null}
                      </div>
                      {archiveWarning ? (
                        <p className={cn('mt-1 flex items-center gap-1 truncate text-xs', archiveInfo?.isUrgent ? 'font-semibold text-on-surface' : 'text-on-surface-variant')}>
                          <Clock className="h-3 w-3 shrink-0" aria-hidden />
                          <span className="truncate">{archiveWarning}</span>
                        </p>
                      ) : isArchived ? (
                        <p className="mt-1 text-xs text-on-surface-variant">{isServerArchived ? 'Auto-archived' : 'Archived'}</p>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuConnectionId(menuConnectionId === conn.id ? null : conn.id);
                      }}
                      data-connection-menu-trigger
                      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] text-on-surface-variant opacity-100 hover:bg-surface hover:text-on-surface md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100 aria-expanded:opacity-100"
                      aria-label={`Actions for ${conn.name}`}
                      aria-haspopup="menu"
                      aria-expanded={menuConnectionId === conn.id}
                    >
                      <MoreHorizontal className="h-4 w-4" aria-hidden />
                    </button>
                  </div>
                  {menuConnectionId === conn.id ? (
                    <RowMenu
                      conn={conn}
                      isArchived={isArchived}
                      isServerArchived={isServerArchived}
                      isCore={coreConnectionIds.has(conn.id)}
                      isBlocked={Boolean(conn.otherUserId && blockedUserIds.has(conn.otherUserId))}
                      muted={muted}
                      isGroupCreator={viewerId === conn.groupCreatedByUserId}
                      busy={busyGroupId === conn.id}
                      actions={actions}
                      onClose={() => setMenuConnectionId(null)}
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
