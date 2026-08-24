'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { getSupabaseClient } from '@/lib/supabase';
import type { ConnectionRecord } from '@/components/dashboard/ConnectionTable';

/**
 * Per-connection lifecycle actions (archive/unarchive, Core list, remove,
 * report, block/unblock), the blocked-user load, and the chat-list row
 * action-menu/long-press plumbing. Extracted verbatim from DashboardView.
 */
export function useConnectionLifecycle({
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
}: {
  user: any;
  getAuthHeaders: () => Promise<HeadersInit>;
  connectionRecords: ConnectionRecord[];
  setConnectionRecords: Dispatch<SetStateAction<ConnectionRecord[]>>;
  archivedConnectionIds: Set<string>;
  setArchivedConnectionIds: Dispatch<SetStateAction<Set<string>>>;
  updateArchivedIds: (updater: (prev: Set<string>) => Set<string>) => void;
  writeArchivedToLocalStorage: (ids: Set<string>) => void;
  setCoreConnectionIds: Dispatch<SetStateAction<Set<string>>>;
  setBlockedUserIds: Dispatch<SetStateAction<Set<string>>>;
  selectedConnection: ConnectionRecord | null;
  setSelectedConnection: Dispatch<SetStateAction<ConnectionRecord | null>>;
  setMenuConnectionId: Dispatch<SetStateAction<string | null>>;
  setSuppressClickConnectionId: Dispatch<SetStateAction<string | null>>;
  setChatListTab: Dispatch<SetStateAction<'active' | 'archived'>>;
  loadConnections: () => Promise<void>;
}) {
  const [archiveTableAvailable, setArchiveTableAvailable] = useState(true);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isMissingArchiveTableError = useCallback((error: any) => {
    const code = error?.code;
    const message = String(error?.message || '').toLowerCase();
    return (
      code === 'PGRST205' ||
      message.includes('connection_archives') ||
      message.includes('connection_hidden') ||
      message.includes('schema cache')
    );
  }, []);

  useEffect(() => {
    if (!user?.id) return;

    const loadBlocks = async () => {
      const supabase = getSupabaseClient();
      if (!supabase) return;
      try {
        const { data, error } = await supabase
          .from('user_blocks')
          .select('blocked_id')
          .eq('blocker_id', user.id);

        if (error) {
          console.error('Error loading blocks:', error.message || error);
          return;
        }

        setBlockedUserIds(new Set((data ?? []).map((row: any) => row.blocked_id)));
      } catch (err) {
        console.error('Unexpected block load error:', err);
      }
    };

    loadBlocks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    const handleGlobalClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('[data-connection-menu]') || target.closest('[data-connection-menu-trigger]')) {
        return;
      }
      setMenuConnectionId(null);
    };
    document.addEventListener('click', handleGlobalClick);
    return () => document.removeEventListener('click', handleGlobalClick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    };
  }, []);

  const archiveConnection = useCallback(async (connectionId: string): Promise<boolean> => {
    updateArchivedIds((prev) => {
      const next = new Set(prev);
      next.add(connectionId);
      return next;
    });
    setMenuConnectionId(null);

    const supabase = getSupabaseClient();
    if (!supabase || !user?.id || !archiveTableAvailable) return true;
    try {
      const { error } = await supabase
        .from('connection_archives')
        .insert({ user_id: user.id, connection_id: connectionId });

      if (error && error.code !== '23505') {
        if (isMissingArchiveTableError(error)) {
          setArchiveTableAvailable(false);
          return true;
        }
        console.error('Error archiving connection:', error.message || error);
        return false;
      }
      return true;
    } catch (err) {
      console.error('Unexpected archive error:', err);
      return false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [archiveTableAvailable, isMissingArchiveTableError, updateArchivedIds, user?.id]);

  const addConnectionToCore = useCallback(async (connectionId: string): Promise<boolean> => {
    setMenuConnectionId(null);
    setCoreConnectionIds((prev) => new Set(prev).add(connectionId));
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/connections/core', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ connection_id: connectionId }),
      });
      if (!res.ok) {
        setCoreConnectionIds((prev) => {
          const next = new Set(prev);
          next.delete(connectionId);
          return next;
        });
        return false;
      }
      return true;
    } catch {
      setCoreConnectionIds((prev) => {
        const next = new Set(prev);
        next.delete(connectionId);
        return next;
      });
      return false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getAuthHeaders]);

  const removeConnectionFromCore = useCallback(async (connectionId: string): Promise<boolean> => {
    setMenuConnectionId(null);
    setCoreConnectionIds((prev) => {
      const next = new Set(prev);
      next.delete(connectionId);
      return next;
    });
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(
        `/api/connections/core?connection_id=${encodeURIComponent(connectionId)}`,
        {
          method: 'DELETE',
          headers,
        },
      );
      if (!res.ok) {
        setCoreConnectionIds((prev) => new Set(prev).add(connectionId));
        return false;
      }
      return true;
    } catch {
      setCoreConnectionIds((prev) => new Set(prev).add(connectionId));
      return false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getAuthHeaders]);

  const unarchiveConnection = useCallback(
    async (connectionId: string): Promise<boolean> => {
      setMenuConnectionId(null);
      setChatListTab('active');

      try {
        const headers = await getAuthHeaders();
        const res = await fetch('/api/connections', {
          method: 'PATCH',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'restore', connectionId }),
        });
        if (!res.ok) {
          const payload = await res.json().catch(() => ({}));
          console.error('Restore failed:', payload.error || res.statusText);
          return false;
        }
        void loadConnections();
        return true;
      } catch (e) {
        console.error('Unexpected restore error:', e);
        return false;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [getAuthHeaders, loadConnections],
  );

  const openActionMenu = useCallback((connectionId: string) => {
    setMenuConnectionId((prev) => (prev === connectionId ? null : connectionId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const removeConnection = useCallback(async (connectionId: string): Promise<boolean> => {
    const prevRecords = connectionRecords;
    const prevArchived = new Set(archivedConnectionIds);
    setConnectionRecords((records) => records.filter((record) => record.id !== connectionId));
    updateArchivedIds((ids) => {
      const next = new Set(ids);
      next.delete(connectionId);
      return next;
    });

    try {
      const headers = await getAuthHeaders();
      const res = await fetch(
        `/api/connections?connectionId=${encodeURIComponent(connectionId)}`,
        { method: 'DELETE', headers },
      );
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.error || 'Remove failed');
      }
      setMenuConnectionId(null);
      if (selectedConnection?.id === connectionId) {
        setSelectedConnection(null);
      }
      return true;
    } catch (err) {
      console.error('Error removing connection:', err);
      setConnectionRecords(prevRecords);
      setArchivedConnectionIds(prevArchived);
      writeArchivedToLocalStorage(prevArchived);
      return false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    archivedConnectionIds,
    connectionRecords,
    getAuthHeaders,
    selectedConnection?.id,
    updateArchivedIds,
    writeArchivedToLocalStorage,
  ]);

  const reportConnection = useCallback(async (connectionId: string, reason: string): Promise<boolean> => {
    const trimmedReason = reason.trim();
    if (!trimmedReason) return false;

    try {
      const response = await fetch('/api/safety/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connection_id: connectionId, reason: trimmedReason }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Failed to submit report');
      }
      setMenuConnectionId(null);
      return true;
    } catch (err) {
      console.error('Error reporting connection:', err);
      return false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const blockUser = useCallback(async (connection: ConnectionRecord): Promise<boolean> => {
    if (!connection.otherUserId) return false;

    try {
      const headers = await getAuthHeaders();
      const response = await fetch('/api/safety/block', {
        method: 'POST',
        headers,
        body: JSON.stringify({ blocked_id: connection.otherUserId }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Failed to block user');
      }

      setBlockedUserIds((prev) => {
        const next = new Set(prev);
        next.add(connection.otherUserId!);
        return next;
      });

      const removed = await removeConnection(connection.id);
      return removed;
    } catch (err) {
      console.error('Error blocking user:', err);
      return false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getAuthHeaders, removeConnection]);

  const unblockUser = useCallback(async (connection: ConnectionRecord): Promise<boolean> => {
    if (!connection.otherUserId) return false;

    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`/api/safety/block?blocked_id=${encodeURIComponent(connection.otherUserId)}`, {
        method: 'DELETE',
        headers,
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Failed to unblock user');
      }

      setBlockedUserIds((prev) => {
        const next = new Set(prev);
        next.delete(connection.otherUserId!);
        return next;
      });
      setMenuConnectionId(null);
      return true;
    } catch (err) {
      console.error('Error unblocking user:', err);
      return false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getAuthHeaders]);

  const startLongPress = useCallback((connectionId: string) => {
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = setTimeout(() => {
      setSuppressClickConnectionId(connectionId);
      setMenuConnectionId(connectionId);
    }, 450);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const endLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  return {
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
  };
}
