'use client';

import { useState, useMemo } from 'react';
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
  Filter
} from 'lucide-react';

export interface ConnectionRecord {
  id: string;
  name: string;
  dateMet: Date;
  location: string;
  context?: string;
  status: 'kept' | 'expired' | 'pending';
  avatarUrl?: string;
  // Geolocation data following the connection schema
  geo_location?: {
    latitude: number;
    longitude: number;
  };
}

interface ConnectionTableProps {
  connections: ConnectionRecord[];
  onExport?: () => void;
}

type SortField = 'name' | 'dateMet' | 'location' | 'status';
type SortOrder = 'asc' | 'desc';

/**
 * ConnectionTable - A searchable, sortable data table of "People I've Met"
 * Part of the Digital Memory Box experience
 */
export default function ConnectionTable({ connections, onExport }: ConnectionTableProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('dateMet');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [statusFilter, setStatusFilter] = useState<'all' | 'kept' | 'expired' | 'pending'>('all');

  // Filter and sort connections
  const filteredConnections = useMemo(() => {
    let filtered = connections.filter((conn) => {
      const matchesSearch = 
        conn.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        conn.location.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (conn.context?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false);
      
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
  }, [connections, searchQuery, sortField, sortOrder, statusFilter]);

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
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-green-500/10 text-green-400 border border-green-500/20">
            <CheckCircle className="w-3 h-3" />
            Kept
          </span>
        );
      case 'expired':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-zinc-500/10 text-zinc-400 border border-zinc-500/20">
            <XCircle className="w-3 h-3" />
            Expired
          </span>
        );
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-amber-500/10 text-amber-400 border border-amber-500/20">
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
    kept: connections.filter(c => c.status === 'kept').length,
    expired: connections.filter(c => c.status === 'expired').length,
    pending: connections.filter(c => c.status === 'pending').length,
  };

  return (
    <div className="space-y-4">
      {/* Header with stats */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-6">
          <div className="text-sm">
            <span className="text-zinc-500">Total:</span>{' '}
            <span className="text-white font-semibold">{stats.total}</span>
          </div>
          <div className="text-sm">
            <span className="text-zinc-500">Kept:</span>{' '}
            <span className="text-green-400 font-semibold">{stats.kept}</span>
          </div>
          <div className="text-sm">
            <span className="text-zinc-500">Pending:</span>{' '}
            <span className="text-amber-400 font-semibold">{stats.pending}</span>
          </div>
        </div>

        {/* Export button */}
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={onExport}
          className="flex items-center gap-2 px-4 py-2 bg-[#8338EC] hover:bg-[#9d4eff] rounded-xl text-sm font-medium transition-colors"
        >
          <Download className="w-4 h-4" />
          Export to CSV
        </motion.button>
      </div>

      {/* Search and filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input
            type="text"
            placeholder="Search by name, location, or context..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-3 bg-zinc-900/50 border border-zinc-700 rounded-xl focus:outline-none focus:border-[#8338EC] transition-colors text-sm"
          />
        </div>
        
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-zinc-500" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="px-4 py-3 bg-zinc-900/50 border border-zinc-700 rounded-xl focus:outline-none focus:border-[#8338EC] transition-colors text-sm appearance-none cursor-pointer"
          >
            <option value="all">All Status</option>
            <option value="kept">Kept</option>
            <option value="pending">Pending</option>
            <option value="expired">Expired</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-zinc-800">
        <table className="w-full">
          <thead>
            <tr className="bg-zinc-900/50 border-b border-zinc-800">
              <th 
                className="text-left px-4 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wider cursor-pointer hover:text-white transition-colors"
                onClick={() => handleSort('name')}
              >
                <div className="flex items-center gap-1">
                  Name
                  <SortIcon field="name" />
                </div>
              </th>
              <th 
                className="text-left px-4 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wider cursor-pointer hover:text-white transition-colors"
                onClick={() => handleSort('dateMet')}
              >
                <div className="flex items-center gap-1">
                  Date Met
                  <SortIcon field="dateMet" />
                </div>
              </th>
              <th 
                className="text-left px-4 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wider cursor-pointer hover:text-white transition-colors"
                onClick={() => handleSort('location')}
              >
                <div className="flex items-center gap-1">
                  Location
                  <SortIcon field="location" />
                </div>
              </th>
              <th 
                className="text-left px-4 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wider cursor-pointer hover:text-white transition-colors"
                onClick={() => handleSort('status')}
              >
                <div className="flex items-center gap-1">
                  Status
                  <SortIcon field="status" />
                </div>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            <AnimatePresence>
              {filteredConnections.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-12 text-center text-zinc-500">
                    {searchQuery || statusFilter !== 'all' 
                      ? 'No connections match your search'
                      : 'No connections yet. Start meeting people!'}
                  </td>
                </tr>
              ) : (
                filteredConnections.map((connection, index) => (
                  <motion.tr
                    key={connection.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ delay: index * 0.02 }}
                    className="hover:bg-zinc-900/30 transition-colors cursor-pointer group"
                  >
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#8338EC] to-[#3A86FF] flex items-center justify-center text-xs font-bold">
                          {connection.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-white group-hover:text-[#8338EC] transition-colors">
                            {connection.name}
                          </p>
                          {connection.context && (
                            <p className="text-xs text-zinc-500">{connection.context}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2 text-sm text-zinc-300">
                        <Calendar className="w-4 h-4 text-zinc-500" />
                        {formatDate(connection.dateMet)}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2 text-sm text-zinc-300">
                        <MapPin className="w-4 h-4 text-zinc-500" />
                        {connection.location}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      {getStatusBadge(connection.status)}
                    </td>
                  </motion.tr>
                ))
              )}
            </AnimatePresence>
          </tbody>
        </table>
      </div>

      {/* Pagination hint */}
      {filteredConnections.length > 0 && (
        <p className="text-xs text-zinc-500 text-center">
          Showing {filteredConnections.length} of {connections.length} connections
        </p>
      )}
    </div>
  );
}
