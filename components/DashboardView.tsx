'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { getSupabaseClient } from '@/lib/supabase';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MapPin,
  Settings,
  Users,
  QrCode,
  BookOpen,
  Sparkles,
  MessageCircle,
  MoreHorizontal
} from 'lucide-react';
import SettingsView from '@/components/SettingsView';
import { ChatView } from '@/components/chat';
import InterestTagging from '@/components/InterestTagging';

// Digital Memory Box components
import {
  ConnectionTable,
  TimeCapsule,
  QRIdentityCard,
  StatsOverview,
  AchievementBadge,
  MilestoneProgress,
  ConnectionMap
} from '@/components/dashboard';
import type { ConnectionRecord } from '@/components/dashboard/ConnectionTable';
import type { TimelineChapter } from '@/components/dashboard/TimeCapsule';
import {
  mockConnections,
  mockChapters,
  downloadCSV,
  generateChaptersFromConnections
} from '@/lib/dashboard/mockData';

type DashboardTab = 'memory' | 'map' | 'chat' | 'identity' | 'settings';

interface DashboardViewProps {
  user: any;
}

/**
 * DashboardView - The Digital Memory Box experience
 * Combines connections, timeline, map, QR identity, and settings
 */
export default function DashboardView({ user }: DashboardViewProps) {
  const { signOut } = useAuth();
  const [activeTab, setActiveTab] = useState<DashboardTab>('memory');
  const [connectionRecords, setConnectionRecords] = useState<ConnectionRecord[]>([]);
  const [chapters, setChapters] = useState<TimelineChapter[]>([]);
  /** The connection whose chat is currently open, or null */
  const [selectedConnection, setSelectedConnection] = useState<ConnectionRecord | null>(null);
  const [chatListTab, setChatListTab] = useState<'active' | 'archived'>('active');
  const [archivedConnectionIds, setArchivedConnectionIds] = useState<Set<string>>(new Set());
  const [blockedUserIds, setBlockedUserIds] = useState<Set<string>>(new Set());
  const [menuConnectionId, setMenuConnectionId] = useState<string | null>(null);
  const [suppressClickConnectionId, setSuppressClickConnectionId] = useState<string | null>(null);
  const [archiveTableAvailable, setArchiveTableAvailable] = useState(true);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Interest tagging onboarding gate
  const [needsTagging, setNeedsTagging] = useState<boolean | null>(null);

  useEffect(() => {
    if (user) {
      // Query tags_initialized — the canonical signal for onboarding completion.
      // Falls back gracefully on any schema/network error so the user is never blocked.
      const checkTagsInitialized = async () => {
        const supabase = getSupabaseClient();
        if (!supabase) { setNeedsTagging(false); return; }
        try {
          const { data, error } = await supabase
            .from('users')
            .select('tags_initialized')
            .eq('id', user.id)
            .maybeSingle();
          if (error) {
            // Schema/network error — don't block the user
            setNeedsTagging(false);
            return;
          }
          // data is null when no public.users row exists yet (trigger backfill pending)
          setNeedsTagging(data != null && data.tags_initialized !== true);
        } catch {
          // Network or schema error — don't block
          setNeedsTagging(false);
        }
      };
      checkTagsInitialized();
    }
  }, [user]);

  const handleTagsComplete = async (tags: string[]) => {
    const supabase = getSupabaseClient();
    if (supabase) {
      // Save to user_metadata (always works, persists across sessions)
      await supabase.auth.updateUser({ data: { tags } });
      // Also persist to DB with the initialized flag
      try {
        await supabase.from('users').update({ tags, tags_initialized: true }).eq('id', user.id);
      } catch {
        // Best-effort — auth metadata save is sufficient
      }
    }
    setNeedsTagging(false);
  };

  const handleTagsSkip = async () => {
    // Immediately hide the screen; persist the skip flag to DB in the background
    setNeedsTagging(false);
    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        await supabase.from('users').update({ tags_initialized: true }).eq('id', user.id);
      } catch {
        // Best-effort
      }
    }
  };

  // Fetch user connections
  useEffect(() => {
    if (user) {
      const fetchConnections = async () => {
        const supabase = getSupabaseClient();
        if (!supabase) {
          setConnectionRecords(mockConnections);
          setChapters(mockChapters);
          return;
        }

        try {
          const { data, error } = await supabase
            .from('connections')
            .select('*')
            .contains('user_ids', [user.id])
            .order('created', { ascending: false });

          if (error) {
            console.error('Error fetching connections:', error.message || error);
            setConnectionRecords(mockConnections);
            setChapters(mockChapters);
          } else if (data && data.length > 0) {
            // Resolve other user names from the users table
            const otherUserIds = data.flatMap((conn: any) =>
              (conn.user_ids || []).filter((id: string) => id !== user.id)
            ).filter((id: string, i: number, arr: string[]) => arr.indexOf(id) === i);

            let userNameMap: Record<string, string> = {};
            if (otherUserIds.length > 0) {
              // Resolve names through the server so we can fall back to auth metadata
              // when profile rows are incomplete.
              try {
                const nameRes = await fetch('/api/users/display-names', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ userIds: otherUserIds }),
                });
                if (nameRes.ok) {
                  const payload = await nameRes.json();
                  userNameMap = payload?.names ?? {};
                }
              } catch {
                // Fall through to direct DB lookup below.
              }

              if (Object.keys(userNameMap).length === 0) {
                // Fallback path if the server helper is unavailable.
                let usersData: any[] | null = null;
                const { data: d1, error: e1 } = await supabase
                  .from('users')
                  .select('id, name, full_name, email')
                  .in('id', otherUserIds);
                if (!e1 && d1) {
                  usersData = d1;
                } else {
                  const { data: d2 } = await supabase
                    .from('users')
                    .select('id, name, email')
                    .in('id', otherUserIds);
                  usersData = d2;
                }

                if (usersData) {
                  userNameMap = Object.fromEntries(
                    usersData.map((u: any) => {
                      const resolvedName =
                        (typeof u.full_name === 'string' && u.full_name.trim()) ||
                        (typeof u.name === 'string' && u.name.trim()) ||
                        (typeof u.email === 'string' && u.email.includes('@') ? u.email.split('@')[0] : '') ||
                        '';
                      return [u.id, resolvedName];
                    })
                  );
                }
              }
            }

            const records: ConnectionRecord[] = data.map((conn: any) => {
              // Resolve the other user's name
              const otherUserId = (conn.user_ids || []).find((id: string) => id !== user.id);
              const otherUserName = (otherUserId && userNameMap[otherUserId]) || null;

              // Parse geo_location — DB stores { lat, lon }, filter out invalid coords
              let geoLoc: { latitude: number; longitude: number } | undefined;
              if (conn.geo_location) {
                const rawLat = conn.geo_location.lat ?? conn.geo_location.latitude;
                const rawLon = conn.geo_location.lon ?? conn.geo_location.longitude ?? conn.geo_location.lng ?? conn.geo_location.long;
                const lat = typeof rawLat === 'number' ? rawLat : Number(rawLat);
                const lon = typeof rawLon === 'number' ? rawLon : Number(rawLon);
                if (
                  typeof lat === 'number' && typeof lon === 'number' &&
                  isFinite(lat) && isFinite(lon) &&
                  !(lat === 0 && lon === 0)
                ) {
                  geoLoc = { latitude: lat, longitude: lon };
                }
              }

              const displayName =
                (typeof otherUserName === 'string' && otherUserName.trim()) ||
                'Connection';

              return {
                id: conn.id,
                otherUserId,
                name: displayName,
                dateMet: new Date(conn.created || conn.created_at),
                location: conn.semantic_location || 'Unknown location',
                context: conn.context || undefined,
                status: conn.status || 'kept',
                geo_location: geoLoc,
              };
            });

            setConnectionRecords(records);
            setChapters(generateChaptersFromConnections(records));
          } else {
            setConnectionRecords(mockConnections);
            setChapters(mockChapters);
          }
        } catch (err) {
          console.error('Unexpected error fetching connections:', err);
          setConnectionRecords(mockConnections);
          setChapters(mockChapters);
        }
      };

      fetchConnections();
    }
  }, [user]);

  // Handle CSV export
  const handleExport = useCallback(() => {
    downloadCSV(connectionRecords, `click-connections-${user.email?.split('@')[0] || 'user'}`);
  }, [connectionRecords, user]);

  // Shared handler: open chat for a specific connection
  const handleOpenChat = useCallback((conn: ConnectionRecord) => {
    setSelectedConnection(conn);
    setActiveTab('chat');
  }, []);

  const userName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User';

  const archiveStorageKey = user?.id ? `click:archived-connections:${user.id}` : null;

  const isMissingArchiveTableError = useCallback((error: any) => {
    const code = error?.code;
    const message = String(error?.message || '').toLowerCase();
    return code === 'PGRST205' ||
      message.includes('connection_archives') ||
      message.includes('schema cache');
  }, []);

  const writeArchivedToLocalStorage = useCallback((ids: Set<string>) => {
    if (!archiveStorageKey || typeof window === 'undefined') return;
    localStorage.setItem(archiveStorageKey, JSON.stringify(Array.from(ids)));
  }, [archiveStorageKey]);

  useEffect(() => {
    if (!user?.id) return;

    const loadArchived = async () => {
      const supabase = getSupabaseClient();
      if (!supabase) {
        if (archiveStorageKey && typeof window !== 'undefined') {
          const raw = localStorage.getItem(archiveStorageKey);
          if (raw) {
            try {
              setArchivedConnectionIds(new Set(JSON.parse(raw)));
            } catch {
              setArchivedConnectionIds(new Set());
            }
          }
        }
        return;
      }

      try {
        if (!archiveTableAvailable) {
          if (archiveStorageKey && typeof window !== 'undefined') {
            const raw = localStorage.getItem(archiveStorageKey);
            if (raw) {
              try {
                setArchivedConnectionIds(new Set(JSON.parse(raw)));
              } catch {
                setArchivedConnectionIds(new Set());
              }
            }
          }
          return;
        }

        const { data, error } = await supabase
          .from('connection_archives')
          .select('connection_id')
          .eq('user_id', user.id);

        if (error) {
          if (isMissingArchiveTableError(error)) {
            setArchiveTableAvailable(false);
          }
          if (archiveStorageKey && typeof window !== 'undefined') {
            const raw = localStorage.getItem(archiveStorageKey);
            if (raw) {
              try {
                setArchivedConnectionIds(new Set(JSON.parse(raw)));
              } catch {
                setArchivedConnectionIds(new Set());
              }
            }
          }
          return;
        }

        const ids = new Set<string>((data ?? []).map((row: any) => row.connection_id));
        setArchivedConnectionIds(ids);
        writeArchivedToLocalStorage(ids);
      } catch {
        if (archiveStorageKey && typeof window !== 'undefined') {
          const raw = localStorage.getItem(archiveStorageKey);
          if (raw) {
            try {
              setArchivedConnectionIds(new Set(JSON.parse(raw)));
            } catch {
              setArchivedConnectionIds(new Set());
            }
          }
        }
      }
    };

    loadArchived();
  }, [archiveStorageKey, archiveTableAvailable, isMissingArchiveTableError, user?.id, writeArchivedToLocalStorage]);

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
  }, []);

  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    };
  }, []);

  const updateArchivedIds = useCallback((updater: (prev: Set<string>) => Set<string>) => {
    setArchivedConnectionIds((prev) => {
      const next = updater(prev);
      writeArchivedToLocalStorage(next);
      return next;
    });
  }, [writeArchivedToLocalStorage]);

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
  }, [archiveTableAvailable, isMissingArchiveTableError, updateArchivedIds, user?.id]);

  const unarchiveConnection = useCallback(async (connectionId: string): Promise<boolean> => {
    updateArchivedIds((prev) => {
      const next = new Set(prev);
      next.delete(connectionId);
      return next;
    });
    setMenuConnectionId(null);
    setChatListTab('active');

    const supabase = getSupabaseClient();
    if (!supabase || !user?.id || !archiveTableAvailable) return true;
    try {
      const { error } = await supabase
        .from('connection_archives')
        .delete()
        .eq('user_id', user.id)
        .eq('connection_id', connectionId);

      if (error) {
        if (isMissingArchiveTableError(error)) {
          setArchiveTableAvailable(false);
          return true;
        }
        console.error('Error unarchiving connection:', error.message || error);
        return false;
      }
      return true;
    } catch (err) {
      console.error('Unexpected unarchive error:', err);
      return false;
    }
  }, [archiveTableAvailable, isMissingArchiveTableError, updateArchivedIds, user?.id]);

  const openActionMenu = useCallback((connectionId: string) => {
    setMenuConnectionId((prev) => (prev === connectionId ? null : connectionId));
  }, []);

  const removeConnection = useCallback(async (connectionId: string): Promise<boolean> => {
    const supabase = getSupabaseClient();
    if (!supabase) return false;

    const prev = connectionRecords;
    setConnectionRecords((records) => records.filter((record) => record.id !== connectionId));
    updateArchivedIds((ids) => {
      const next = new Set(ids);
      next.delete(connectionId);
      return next;
    });

    try {
      const { error } = await supabase
        .from('connections')
        .delete()
        .eq('id', connectionId);

      if (error) {
        throw error;
      }
      setMenuConnectionId(null);
      return true;
    } catch (err) {
      console.error('Error removing connection:', err);
      setConnectionRecords(prev);
      return false;
    }
  }, [connectionRecords, updateArchivedIds]);

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
  }, []);

  const blockUser = useCallback(async (connection: ConnectionRecord): Promise<boolean> => {
    if (!connection.otherUserId) return false;

    try {
      const response = await fetch('/api/safety/block', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
  }, [removeConnection]);

  const unblockUser = useCallback(async (connection: ConnectionRecord): Promise<boolean> => {
    if (!connection.otherUserId) return false;

    try {
      const response = await fetch(`/api/safety/block?blocked_id=${encodeURIComponent(connection.otherUserId)}`, {
        method: 'DELETE',
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
  }, []);

  const startLongPress = useCallback((connectionId: string) => {
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = setTimeout(() => {
      setSuppressClickConnectionId(connectionId);
      setMenuConnectionId(connectionId);
    }, 450);
  }, []);

  const endLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const chatCandidates = useMemo(
    () => connectionRecords.filter((c) => c.status === 'kept' || c.status === 'pending'),
    [connectionRecords]
  );

  const activeConnections = useMemo(
    () => chatCandidates.filter((c) => !archivedConnectionIds.has(c.id)),
    [chatCandidates, archivedConnectionIds]
  );

  const archivedConnections = useMemo(
    () => chatCandidates.filter((c) => archivedConnectionIds.has(c.id)),
    [chatCandidates, archivedConnectionIds]
  );

  const visibleChatConnections = chatListTab === 'active' ? activeConnections : archivedConnections;

  const tabs: { id: DashboardTab; label: string; icon: any }[] = [
    { id: 'memory', label: 'Memory Box', icon: BookOpen },
    { id: 'map', label: 'Map', icon: MapPin },
    { id: 'chat', label: 'Chat', icon: MessageCircle },
    { id: 'identity', label: 'QR Identity', icon: QrCode },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Interest tagging onboarding overlay */}
      {needsTagging === true && (
        <InterestTagging
          onComplete={handleTagsComplete}
          onSkip={handleTagsSkip}
          canSkip={true}
        />
      )}

      {/* Background effects */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-[#8338EC] rounded-full blur-[150px] opacity-10" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-[#3A86FF] rounded-full blur-[150px] opacity-10" />
      </div>

      {/* Main content */}
      <div className="relative z-10">
        {/* Welcome header */}
        <div className="px-6 md:px-12 pt-6 pb-4">
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-3"
          >
            <Sparkles className="w-5 h-5 text-[#8338EC]" />
            <div>
              <h1 className="text-2xl font-bold">
                Welcome back, <span className="text-[#8338EC]">{userName}</span>
              </h1>
              <p className="text-sm text-zinc-500">Your digital memory box</p>
            </div>
          </motion.div>
        </div>

        {/* Tabs */}
        <div className="border-b border-zinc-800 sticky top-0 bg-zinc-950/80 backdrop-blur-sm z-20">
          <div className="px-6 md:px-12 flex gap-1 overflow-x-auto scrollbar-hide">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`relative py-4 px-4 transition-colors flex items-center gap-2 whitespace-nowrap ${activeTab === tab.id
                    ? 'text-[#8338EC]'
                    : 'text-zinc-400 hover:text-white'
                    }`}
                >
                  <Icon className="w-5 h-5" />
                  <span className="hidden sm:inline">{tab.label}</span>
                  {activeTab === tab.id && (
                    <motion.div
                      layoutId="activeTab"
                      className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#8338EC]"
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <div className="px-6 md:px-12 py-8">
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
                    totalConnections={connectionRecords.length}
                    thisMonth={connectionRecords.filter(c => {
                      const now = new Date();
                      const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
                      return c.dateMet >= thisMonth;
                    }).length}
                    streak={7}
                    retentionRate={Math.round((connectionRecords.filter(c => c.status === 'kept').length / Math.max(connectionRecords.length, 1)) * 100)}
                  />
                </section>

                {/* Achievements & Milestones Row */}
                <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-3">
                    <h3 className="text-sm font-medium text-zinc-400 mb-2">Recent Achievements</h3>
                    <AchievementBadge
                      title="Social Butterfly"
                      description="Met 10+ people this month"
                      isNew={true}
                    />
                    <AchievementBadge
                      title="Week Warrior"
                      description="7-day connection streak"
                    />
                  </div>
                  <div className="space-y-3">
                    <h3 className="text-sm font-medium text-zinc-400 mb-2">Next Milestone</h3>
                    <MilestoneProgress
                      current={connectionRecords.length}
                      target={25}
                      label="Connection Collector"
                      reward="Special badge unlock"
                    />
                  </div>
                </section>

                {/* Time Capsule Section */}
                <section className="glass p-6 rounded-3xl border border-zinc-800">
                  <TimeCapsule chapters={chapters} onConnectionClick={handleOpenChat} />
                </section>

                {/* Connection Table Section */}
                <section className="glass p-6 rounded-3xl border border-zinc-800">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-[#8338EC]/20 rounded-xl">
                      <Users className="w-5 h-5 text-[#8338EC]" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold">People I've Met</h2>
                      <p className="text-sm text-zinc-500">Your connection history</p>
                    </div>
                  </div>
                  <ConnectionTable
                    connections={connectionRecords}
                    onExport={handleExport}
                    onSelect={handleOpenChat}
                  />
                </section>

                {/* Data sovereignty notice */}
                <div className="text-center py-4">
                  <p className="text-xs text-zinc-600">
                    🔒 Your data belongs to you. Export anytime, delete anytime.
                  </p>
                </div>
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
                  <div className="p-2 bg-[#8338EC]/20 rounded-xl">
                    <MapPin className="w-5 h-5 text-[#8338EC]" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold">Connection Map</h2>
                    <p className="text-sm text-zinc-500">Where your memories were made</p>
                  </div>
                </div>

                <ConnectionMap connections={connectionRecords} onConnectionClick={handleOpenChat} />
              </motion.div>
            )}

            {/* Chat Tab */}
            {activeTab === 'chat' && (
              <motion.div
                key="chat"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
                className="h-[calc(100dvh-180px)]"
              >
                {selectedConnection ? (
                  <ChatView
                    connection={selectedConnection}
                    currentUserId={user.id}
                    otherUserName={selectedConnection.name}
                    isArchived={archivedConnectionIds.has(selectedConnection.id)}
                    isBlocked={selectedConnection.otherUserId ? blockedUserIds.has(selectedConnection.otherUserId) : false}
                    onArchive={() => archiveConnection(selectedConnection.id)}
                    onUnarchive={() => unarchiveConnection(selectedConnection.id)}
                    onRemove={() => removeConnection(selectedConnection.id)}
                    onReport={(reason) => reportConnection(selectedConnection.id, reason)}
                    onBlock={() => blockUser(selectedConnection)}
                    onUnblock={() => unblockUser(selectedConnection)}
                    onClose={() => setSelectedConnection(null)}
                  />
                ) : (
                  /* Connection picker list */
                  <div className="space-y-6">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-[#8338EC]/20 rounded-xl">
                        <MessageCircle className="w-5 h-5 text-[#8338EC]" />
                      </div>
                      <div>
                        <h2 className="text-xl font-bold">Messages</h2>
                        <p className="text-sm text-zinc-500">Chat with your connections</p>
                      </div>
                    </div>

                    <div className="inline-flex rounded-xl border border-zinc-800 bg-zinc-900/50 p-1">
                      <button
                        onClick={() => setChatListTab('active')}
                        className={`px-4 py-1.5 rounded-lg text-sm transition-colors ${
                          chatListTab === 'active'
                            ? 'bg-[#8338EC]/20 text-[#C3A6FF] border border-[#8338EC]/30'
                            : 'text-zinc-400 hover:text-white'
                        }`}
                      >
                        Active ({activeConnections.length})
                      </button>
                      <button
                        onClick={() => setChatListTab('archived')}
                        className={`px-4 py-1.5 rounded-lg text-sm transition-colors ${
                          chatListTab === 'archived'
                            ? 'bg-[#8338EC]/20 text-[#C3A6FF] border border-[#8338EC]/30'
                            : 'text-zinc-400 hover:text-white'
                        }`}
                      >
                        Archived ({archivedConnections.length})
                      </button>
                    </div>

                    {visibleChatConnections.length === 0 ? (
                      <div className="glass p-12 rounded-3xl border border-zinc-800 text-center">
                        <MessageCircle className="w-16 h-16 text-zinc-600 mx-auto mb-4" />
                        <h3 className="text-xl font-semibold mb-2">
                          {chatListTab === 'active' ? 'No Active Conversations' : 'No Archived Conversations'}
                        </h3>
                        <p className="text-zinc-400">
                          {chatListTab === 'active'
                            ? 'Start meeting people and your chats will appear here!'
                            : 'Archived chats will appear here.'}
                        </p>
                      </div>
                    ) : (
                      <div className="glass rounded-3xl border border-zinc-800 divide-y divide-zinc-800/50">
                        {visibleChatConnections.map((conn) => {
                          const isArchived = archivedConnectionIds.has(conn.id);
                          return (
                            <div key={conn.id} className="relative">
                              <motion.button
                                whileHover={{ backgroundColor: 'rgba(131, 56, 236, 0.05)' }}
                                whileTap={{ scale: 0.995 }}
                                onClick={() => {
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
                                className="w-full flex items-center gap-4 px-5 py-4 pr-16 text-left transition-colors"
                              >
                                <div className="w-11 h-11 rounded-full bg-gradient-to-br from-[#8338EC] to-[#3A86FF] flex items-center justify-center text-sm font-bold shrink-0">
                                  {conn.name.charAt(0).toUpperCase()}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="font-semibold text-white truncate">{conn.name}</p>
                                  <p className="text-xs text-zinc-500 truncate">
                                    {conn.location} · {conn.dateMet.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                  </p>
                                </div>
                                {conn.context && (
                                  <span className="shrink-0 text-[10px] px-2 py-0.5 rounded-full bg-[#8338EC]/10 text-[#8338EC] border border-[#8338EC]/20">
                                    {conn.context}
                                  </span>
                                )}
                                {isArchived ? (
                                  <span className="shrink-0 text-[10px] px-2 py-0.5 rounded-full bg-zinc-700/30 text-zinc-300 border border-zinc-600/40">
                                    Archived
                                  </span>
                                ) : null}
                                <MessageCircle className="w-4 h-4 text-zinc-600 shrink-0" />
                              </motion.button>

                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openActionMenu(conn.id);
                                }}
                                data-connection-menu-trigger
                                className="absolute right-4 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800/70"
                                aria-label={`Open actions for ${conn.name}`}
                              >
                                <MoreHorizontal className="w-4 h-4" />
                              </button>

                              {menuConnectionId === conn.id && (
                                <div
                                  data-connection-menu
                                  className="absolute right-4 top-[calc(50%+1.8rem)] z-20 min-w-[140px] rounded-xl border border-zinc-700 bg-zinc-900 shadow-xl overflow-hidden"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <button
                                    onClick={() => {
                                      setSelectedConnection(conn);
                                      setMenuConnectionId(null);
                                    }}
                                    className="w-full text-left px-3 py-2 text-sm text-white hover:bg-zinc-800"
                                  >
                                    Open chat
                                  </button>
                                  {isArchived ? (
                                    <button
                                      onClick={() => unarchiveConnection(conn.id)}
                                      className="w-full text-left px-3 py-2 text-sm text-[#7cc3ff] hover:bg-zinc-800"
                                    >
                                      Unarchive
                                    </button>
                                  ) : (
                                    <button
                                      onClick={() => archiveConnection(conn.id)}
                                      className="w-full text-left px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
                                    >
                                      Archive
                                    </button>
                                  )}
                                  <button
                                    onClick={async () => {
                                      const reason = window.prompt('Report reason');
                                      if (!reason) return;
                                      await reportConnection(conn.id, reason);
                                      setMenuConnectionId(null);
                                    }}
                                    className="w-full text-left px-3 py-2 text-sm text-amber-300 hover:bg-zinc-800"
                                  >
                                    Report
                                  </button>
                                  {conn.otherUserId && blockedUserIds.has(conn.otherUserId) ? (
                                    <button
                                      onClick={async () => {
                                        await unblockUser(conn);
                                        setMenuConnectionId(null);
                                      }}
                                      className="w-full text-left px-3 py-2 text-sm text-emerald-300 hover:bg-zinc-800"
                                    >
                                      Unblock
                                    </button>
                                  ) : (
                                    <button
                                      onClick={async () => {
                                        await blockUser(conn);
                                        setMenuConnectionId(null);
                                      }}
                                      className="w-full text-left px-3 py-2 text-sm text-orange-300 hover:bg-zinc-800"
                                    >
                                      Block
                                    </button>
                                  )}
                                  <button
                                    onClick={async () => {
                                      await removeConnection(conn.id);
                                      setMenuConnectionId(null);
                                    }}
                                    className="w-full text-left px-3 py-2 text-sm text-red-300 hover:bg-zinc-800"
                                  >
                                    Remove connection
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
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
                  userName={user?.user_metadata?.full_name}
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
                <SettingsView />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

    </div>
  );
}