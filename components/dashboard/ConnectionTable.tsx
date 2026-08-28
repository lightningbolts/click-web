'use client';

import { useState, useMemo, useDeferredValue } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Search, 
  Calendar, 
  MapPin, 
  CheckCircle, 
  XCircle, 
  Download,
  ChevronUp,
  ChevronDown,
  Filter,
  MessageCircle,
  Zap,
} from 'lucide-react';
import type { NoiseLevelKey } from '@/lib/dashboard/connectionExtras';
import type { ConnectionDisplayStatus } from '@/lib/dashboard/connectionStatus';
import { MomentBlock } from '@/components/dashboard/MomentIndicators';
import { ConnectionPeerAvatar } from '@/components/dashboard/ConnectionPeerAvatar';
import { PriorConnectionBadge } from '@/components/profile/PriorConnectionBadge';
import { useAuth } from '@/lib/AuthContext';

export interface ConnectionEncounterBrief {
  id: string;
  encounteredAt: Date;
  locationName?: string;
  displayLocation?: string;
  /** `connection_encounters.semantic_location` for neighbourhood-aware labels */
  semanticLocation?: unknown;
  contextTags: string[];
  /** Present only when the crossing stored a calibrated SPL reading */
  exactNoiseLevelDb?: number;
  /** Raw `weather_snapshot` for ambient mesh (newest crossing is `encounters[0]`). */
  weatherSnapshot?: unknown;
  /** Present only when barometric altitude was captured */
  exactBarometricElevationM?: number;
  /** AGL relative to terrain when derived; prefer over absolute barometric for UI */
  relativeAltitudeM?: number;
  luxLevel?: number;
  motionVariance?: number;
  compassAzimuth?: number;
  batteryLevel?: number;
}

export interface ConnectionRecord {
  id: string;
  /** Direct 1:1 vs mathematically verified group clique chat */
  chatKind?: 'direct' | 'group_clique';
  /** When [chatKind] is `group_clique`, the `public.chats.id` for this group (messages + realtime). */
  groupChatId?: string;
  /** `public.groups.created_by` when [chatKind] is `group_clique`. */
  groupCreatedByUserId?: string;
  otherUserId?: string;
  /** Both user IDs from the connection (needed for E2EE key derivation) */
  userIds?: string[];
  name: string;
  dateMet: Date;
  location: string;
  /** Event / context tag (from memory_capsule or context_tag_id) */
  context?: string;
  /** Weather when you connected, if captured */
  weatherSummary?: string;
  /** Noise level category and/or measured dB */
  noiseSummary?: string;
  /** Tier for volume-bar display (1 / 2 / 3 bars) */
  noiseCategory?: NoiseLevelKey;
  status: ConnectionDisplayStatus;
  /** Server `last_message_at` (ms) for auto-archive countdowns in the dashboard */
  lastMessageAt?: number | null;
  /** Raw `created` (ms) from Supabase when available */
  connectionCreatedMs?: number;
  hasBegun?: boolean;
  expiryState?: string | null;
  /** Other participant's `public.users.image` when known (nullable). */
  avatarUrl?: string | null;
  geo_location?: {
    latitude: number;
    longitude: number;
  };
  chatPreview?: string | null;
  chatLastMessageAt?: number | null;
  chatUpdatedAt?: number | null;
  /** Newest-first timeline from `connection_encounters`, when present */
  encounters?: ConnectionEncounterBrief[];
  /** When viewer and peer share an active intent tag or timeframe */
  intentOverlapLabel?: string | null;
  /** handshake (default) vs self-reported prior */
  source?: 'handshake' | 'prior' | string | null;
  knownSince?: string | null;
}

interface ConnectionTableProps {
  connections: ConnectionRecord[];
  onExport?: () => void;
  /** Called when a row is clicked – opens the chat view */
  onSelect?: (connection: ConnectionRecord) => void;
  /** Avatar tap opens public profile (does not select row). Second arg is the connection id. */
  onOpenProfile?: (userId: string, connectionId?: string) => void;
}

type SortField = 'name' | 'dateMet' | 'location' | 'status';
type SortOrder = 'asc' | 'desc';

/**
 * ConnectionTable - A searchable, sortable data table of "People I've Met"
 * Part of the Digital Memory Box experience
 */
export default function ConnectionTable({ connections, onExport, onSelect, onOpenProfile }: ConnectionTableProps) {
  const { onlineUserIds, user: authUser } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('dateMet');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'kept' | 'active' | 'pending' | 'archived' | 'removed' | 'expired'
  >('all');

  // Defer the search term so each keystroke updates the input immediately while
  // the O(n) filter/sort over the full table runs at lower priority.
  const deferredSearchQuery = useDeferredValue(searchQuery);

  // Filter and sort connections
  const filteredConnections = useMemo(() => {
    const filtered = connections.filter((conn) => {
      const q = deferredSearchQuery.toLowerCase();
      const matchesSearch = 
        conn.name.toLowerCase().includes(q) ||
        conn.location.toLowerCase().includes(q) ||
        (conn.context?.toLowerCase().includes(q) ?? false) ||
        (conn.weatherSummary?.toLowerCase().includes(q) ?? false) ||
        (conn.noiseSummary?.toLowerCase().includes(q) ?? false) ||
        (conn.intentOverlapLabel?.toLowerCase().includes(q) ?? false);
      
      const matchesStatus = statusFilter === 'all' || conn.status === statusFilter;
      
      return matchesSearch && matchesStatus;
    });

    // Sort
    filtered.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'dateMet':
          comparison = a.dateMet.getTime() - b.dateMet.getTime();
          break;
        case 'location':
          comparison = a.location.localeCompare(b.location);
          break;
        case 'status':
          comparison = a.status.localeCompare(b.status);
          break;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return filtered;
  }, [connections, deferredSearchQuery, sortField, sortOrder, statusFilter]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null;
    return sortOrder === 'asc' ? (
      <ChevronUp className="w-4 h-4" />
    ) : (
      <ChevronDown className="w-4 h-4" />
    );
  };

  const getStatusBadge = (status: ConnectionRecord['status']) => {
    switch (status) {
      case 'kept':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-green-500/10 text-green-700 dark:text-green-400 border border-green-500/20">
            <CheckCircle className="w-3 h-3" />
            Kept
          </span>
        );
      case 'active':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-sky-500/10 text-sky-300 border border-sky-500/20">
            <MessageCircle className="w-3 h-3" />
            Active
          </span>
        );
      case 'archived':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-zinc-600/20 text-on-surface-variant border border-zinc-600/30">
            <Calendar className="w-3 h-3" />
            Archived
          </span>
        );
      case 'removed':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-red-500/10 text-red-700 dark:text-red-400 border border-red-500/20">
            <XCircle className="w-3 h-3" />
            Removed
          </span>
        );
      case 'expired':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-zinc-500/10 text-on-surface-variant border border-zinc-500/20">
            <XCircle className="w-3 h-3" />
            Expired
          </span>
        );
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20">
            <Calendar className="w-3 h-3" />
            Pending
          </span>
        );
    }
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  // Stats
  const stats = {
    total: connections.length,
    kept: connections.filter((c) => c.status === 'kept').length,
    active: connections.filter((c) => c.status === 'active').length,
    pending: connections.filter((c) => c.status === 'pending').length,
  };

  return (
    <div className="space-y-4">
      {/* Header with stats */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-6">
          <div className="text-sm">
            <span className="text-on-surface-variant">Total:</span>{' '}
            <span className="text-on-surface font-semibold">{stats.total}</span>
          </div>
          <div className="text-sm">
            <span className="text-on-surface-variant">Kept:</span>{' '}
            <span className="text-green-700 dark:text-green-400 font-semibold">{stats.kept}</span>
          </div>
          <div className="text-sm">
            <span className="text-on-surface-variant">Active:</span>{' '}
            <span className="text-sky-300 font-semibold">{stats.active}</span>
          </div>
          <div className="text-sm">
            <span className="text-on-surface-variant">Pending:</span>{' '}
            <span className="text-amber-700 dark:text-amber-300 font-semibold">{stats.pending}</span>
          </div>
        </div>

        {/* Export button */}
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={onExport}
          className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 rounded-xl text-sm font-medium text-on-primary transition-colors"
        >
          <Download className="w-4 h-4" />
          Export to CSV
        </motion.button>
      </div>

      {/* Search and filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant" />
          <input
            type="text"
            placeholder="Search by name, location, event, weather, or noise..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-3 bg-surface-container/50 border border-border-hard rounded-xl focus:outline-none focus:border-primary transition-colors text-sm"
          />
        </div>
        
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-on-surface-variant" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="px-4 py-3 bg-surface-container/50 border border-border-hard rounded-xl focus:outline-none focus:border-primary transition-colors text-sm appearance-none cursor-pointer"
          >
            <option value="all">All Status</option>
            <option value="kept">Kept</option>
            <option value="active">Active</option>
            <option value="pending">Pending</option>
            <option value="archived">Archived</option>
            <option value="expired">Expired</option>
            <option value="removed">Removed</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-border-hard">
        <table className="w-full">
          <thead>
            <tr className="bg-surface-container/50 border-b border-border-hard">
              <th 
                className="text-left px-4 py-3 text-xs font-medium text-on-surface-variant uppercase tracking-wider cursor-pointer hover:text-on-surface transition-colors"
                onClick={() => handleSort('name')}
              >
                <div className="flex items-center gap-1">
                  Name
                  <SortIcon field="name" />
                </div>
              </th>
              <th 
                className="text-left px-4 py-3 text-xs font-medium text-on-surface-variant uppercase tracking-wider cursor-pointer hover:text-on-surface transition-colors"
                onClick={() => handleSort('dateMet')}
              >
                <div className="flex items-center gap-1">
                  Date Met
                  <SortIcon field="dateMet" />
                </div>
              </th>
              <th 
                className="text-left px-4 py-3 text-xs font-medium text-on-surface-variant uppercase tracking-wider cursor-pointer hover:text-on-surface transition-colors"
                onClick={() => handleSort('location')}
              >
                <div className="flex items-center gap-1">
                  Location
                  <SortIcon field="location" />
                </div>
              </th>
              <th className="text-left px-4 py-3 text-xs font-medium text-on-surface-variant uppercase tracking-wider min-w-[11rem] w-[22%]">
                Moment
              </th>
              <th 
                className="text-left px-4 py-3 text-xs font-medium text-on-surface-variant uppercase tracking-wider cursor-pointer hover:text-on-surface transition-colors"
                onClick={() => handleSort('status')}
              >
                <div className="flex items-center gap-1">
                  Status
                  <SortIcon field="status" />
                </div>
              </th>
              <th className="px-4 py-3 text-xs font-medium text-on-surface-variant uppercase tracking-wider" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            <AnimatePresence>
              {filteredConnections.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-on-surface-variant">
                    {searchQuery || statusFilter !== 'all' 
                      ? 'No connections match your search'
                      : 'No connections yet. Start meeting people!'}
                  </td>
                </tr>
              ) : (
                filteredConnections.map((connection, index) => {
                  const selfId = authUser?.id;
                  const peerId =
                    connection.otherUserId ??
                    (selfId ? connection.userIds?.find((id) => id !== selfId) : undefined);
                  const peerOnline = !!(peerId && onlineUserIds.has(peerId));
                  return (
                  <motion.tr
                    key={connection.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ delay: index * 0.02 }}
                    className="hover:bg-surface-container/30 transition-colors cursor-pointer group"
                  onClick={() => onSelect?.(connection)}
                  >
                    <td className="px-4 py-4 align-top">
                      <div className="flex items-center gap-3">
                        {onOpenProfile && peerId ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenProfile(peerId, connection.id);
                            }}
                            className="shrink-0 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                            aria-label={`View ${connection.name}'s profile`}
                          >
                            <ConnectionPeerAvatar
                              label={connection.name}
                              imageUrl={connection.avatarUrl}
                              size="sm"
                              showOnline={peerOnline}
                            />
                          </button>
                        ) : (
                          <ConnectionPeerAvatar
                            label={connection.name}
                            imageUrl={connection.avatarUrl}
                            size="sm"
                            showOnline={peerOnline}
                          />
                        )}
                        <div className="min-w-0">
                          <div className="flex min-w-0 items-center gap-2">
                            <p className="font-medium text-on-surface group-hover:text-primary transition-colors leading-snug truncate">
                              {connection.name}
                            </p>
                            {connection.intentOverlapLabel ? (
                              <span
                                className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-amber-400/40 bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:text-amber-300 shadow-[0_0_12px_rgba(251,191,36,0.35)]"
                                title={`Vibes match: ${connection.intentOverlapLabel}`}
                              >
                                <Zap className="h-3 w-3 text-amber-800 dark:text-amber-300" aria-hidden />
                              </span>
                            ) : null}
                            {connection.source === 'prior' ? (
                              <PriorConnectionBadge className="!px-1.5 !py-0.5 text-[10px]" />
                            ) : null}
                          </div>
                          {connection.chatPreview != null && connection.chatPreview.trim() !== '' ? (
                            <p className="mt-0.5 truncate text-xs text-on-surface-variant">{connection.chatPreview.trim()}</p>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 align-top">
                      <div className="flex items-center gap-2 text-sm text-on-surface">
                        <Calendar className="w-4 h-4 text-on-surface-variant shrink-0" />
                        {formatDate(connection.dateMet)}
                      </div>
                    </td>
                    <td className="px-4 py-4 align-top">
                      <div className="flex items-center gap-2 text-sm text-on-surface">
                        <MapPin className="w-4 h-4 text-on-surface-variant shrink-0" />
                        <span className="leading-snug">{connection.location}</span>
                      </div>
                    </td>
                    <td className="px-4 py-4 align-top border-l border-border-hard/80">
                      {connection.context || connection.weatherSummary || connection.noiseSummary ? (
                        <MomentBlock
                          context={connection.context}
                          weatherSummary={connection.weatherSummary}
                          noiseSummary={connection.noiseSummary}
                          noiseCategory={connection.noiseCategory}
                        />
                      ) : (
                        <span className="text-sm text-on-surface-variant">—</span>
                      )}
                    </td>
                    <td className="px-4 py-4 align-top">
                      {getStatusBadge(connection.status)}
                    </td>
                    <td className="px-4 py-4 align-top">
                      <button
                        onClick={(e) => { e.stopPropagation(); onSelect?.(connection); }}
                        className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 hover:bg-primary/20 border border-primary/30 rounded-xl text-xs text-primary font-medium"
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                        Chat
                      </button>
                    </td>
                  </motion.tr>
                  );
                })
              )}
            </AnimatePresence>
          </tbody>
        </table>
      </div>

      {/* Pagination hint */}
      {filteredConnections.length > 0 && (
        <p className="text-xs text-on-surface-variant text-center">
          Showing {filteredConnections.length} of {connections.length} connections
        </p>
      )}
    </div>
  );
}
