'use client';

import { useCallback, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { getFreshAuthHeaders } from '@/lib/auth/freshAuthHeaders';
import { useSessionCachedState } from '@/lib/dashboard/sessionCache';
import { isActiveChatListStatus } from '@/lib/dashboard/connectionStatus';
import type { ConnectionRecord } from '@/components/dashboard/ConnectionTable';
import type { ChatListConnection } from './types';
import { useVerifiedCliques } from '@/components/dashboard/useVerifiedCliques';
import { useChatListMetadata } from '@/components/dashboard/useChatListMetadata';
import { useConnectionsData } from '@/components/dashboard/useConnectionsData';
import { useChatSearch } from '@/components/dashboard/useChatSearch';
import { useConnectionLifecycle } from '@/components/dashboard/useConnectionLifecycle';

const sortKey = (c: ChatListConnection) => c.chatLastMessageAt ?? c.chatUpdatedAt ?? c.dateMet.getTime();

/**
 * Everything the Clicks inbox and threads read: connections, verified groups, previews and
 * unread counts, Core/Archived/Blocked sets, message search and the lifecycle actions. Lifted
 * out of the legacy dashboard so `/clicks` owns it (spec §7.2). The open thread comes from the
 * URL, so `selectedId` is an input, not state.
 */
export function useClicksData({
  user,
  selectedId,
  onThreadClosed,
}: {
  user: { id: string } & Record<string, unknown>;
  selectedId: string | null;
  /** The open thread's connection was removed or blocked. */
  onThreadClosed: () => void;
}) {
  const userId = user.id;
  const [connectionRecords, setConnectionRecords] = useSessionCachedState<ConnectionRecord[]>(userId, 'connections', []);
  const [, setMapConnectionRecords] = useSessionCachedState<ConnectionRecord[]>(userId, 'mapConnections', []);
  const [archivedConnectionIds, setArchivedConnectionIds] = useSessionCachedState<Set<string>>(userId, 'archivedIds', () => new Set());
  const [coreConnectionIds, setCoreConnectionIds] = useSessionCachedState<Set<string>>(userId, 'coreIds', () => new Set());
  const [loaded, setLoaded] = useSessionCachedState(userId, 'connectionsLoaded', false);
  const [blockedUserIds, setBlockedUserIds] = useState<Set<string>>(new Set());
  const [vibePromptConnection, setVibePromptConnection] = useState<ConnectionRecord | null>(null);
  const [groupClicksReloadNonce, setGroupClicksReloadNonce] = useState(0);
  const chatConnectionMapRef = useRef<Map<string, string>>(new Map());
  // Lifecycle hooks still speak in setters; the URL is the real selection.
  const [, setMenuConnectionId] = useState<string | null>(null);
  const [, setChatListTab] = useState<'active' | 'archived'>('active');

  const archiveStorageKey = `click:archived-connections:${userId}`;
  const writeArchivedToLocalStorage = useCallback(
    (ids: Set<string>) => {
      try {
        localStorage.setItem(archiveStorageKey, JSON.stringify(Array.from(ids)));
      } catch {
        /* private mode */
      }
    },
    [archiveStorageKey],
  );
  const updateArchivedIds = useCallback(
    (updater: (prev: Set<string>) => Set<string>) => {
      setArchivedConnectionIds((prev) => {
        const next = updater(prev);
        writeArchivedToLocalStorage(next);
        return next;
      });
    },
    [writeArchivedToLocalStorage, setArchivedConnectionIds],
  );

  const cliques = useVerifiedCliques({ user, groupClicksReloadNonce });
  const { groupCliqueRecords } = cliques;

  const selectedConnection = useMemo(
    () =>
      selectedId
        ? (connectionRecords.find((c) => c.id === selectedId) ?? groupCliqueRecords.find((c) => c.id === selectedId) ?? null)
        : null,
    [connectionRecords, groupCliqueRecords, selectedId],
  );
  const setSelectedConnection: Dispatch<SetStateAction<ConnectionRecord | null>> = useCallback(
    (next) => {
      if (next === null) onThreadClosed();
    },
    [onThreadClosed],
  );

  const { chatMetadataByConnectionId, refreshDirectPreviews } = useChatListMetadata({
    user,
    connectionRecords,
    selectedConnection,
    groupCliqueRecords,
    chatConnectionMapRef,
  });

  const { loadConnections } = useConnectionsData({
    user,
    getAuthHeaders: getFreshAuthHeaders,
    connectionRecords,
    setConnectionRecords,
    setMapConnectionRecords,
    setArchivedConnectionIds,
    setCoreConnectionIds,
    setConnectionsInitialLoadComplete: setLoaded,
    updateArchivedIds,
    setVibePromptConnection,
  });

  const search = useChatSearch({
    user,
    getAuthHeaders: getFreshAuthHeaders,
    connectionRecords,
    groupCliqueRecords,
    chatConnectionMapRef,
  });

  const lifecycle = useConnectionLifecycle({
    user,
    getAuthHeaders: getFreshAuthHeaders,
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

  const chatCandidates = useMemo<ChatListConnection[]>(
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
        .sort((a, b) => sortKey(b) - sortKey(a)),
    [chatMetadataByConnectionId, connectionRecords, groupCliqueRecords],
  );

  const isArchived = useCallback(
    (c: ConnectionRecord) => c.status === 'archived' || archivedConnectionIds.has(c.id),
    [archivedConnectionIds],
  );
  const active = useMemo(() => chatCandidates.filter((c) => !isArchived(c)), [chatCandidates, isArchived]);
  const archived = useMemo(() => chatCandidates.filter(isArchived), [chatCandidates, isArchived]);
  const core = useMemo(
    () => active.filter((c) => c.chatKind !== 'group_clique' && coreConnectionIds.has(c.id)),
    [active, coreConnectionIds],
  );

  const friendOptions = useMemo(
    () =>
      connectionRecords
        .filter((c) => c.chatKind !== 'group_clique' && isActiveChatListStatus(c.status) && !!c.otherUserId)
        .map((c) => ({ connectionId: c.id, userId: c.otherUserId as string, name: c.name })),
    [connectionRecords],
  );

  return {
    loaded,
    connectionRecords,
    groupCliqueRecords,
    chatCandidates,
    active,
    archived,
    core,
    selectedConnection,
    archivedConnectionIds,
    coreConnectionIds,
    blockedUserIds,
    vibePromptConnection,
    setVibePromptConnection,
    refreshPreviews: refreshDirectPreviews,
    reloadGroups: () => setGroupClicksReloadNonce((n) => n + 1),
    friendOptions,
    cliques,
    search,
    lifecycle,
    isArchived,
  };
}

export type ClicksData = ReturnType<typeof useClicksData>;
