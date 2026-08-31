/**
 * Mock data for the Digital Memory Box dashboard
 * Used for development and demonstration
 */

import type { ConnectionRecord } from '@/components/dashboard/ConnectionTable';
import type { TimelineChapter } from '@/components/dashboard/TimeCapsule';
import { pluralize } from '@/lib/format/pluralize';
import {
  extractEventContext,
  extractNoiseSummary,
  extractWeatherSummary,
  normalizeNoiseCategory,
} from '@/lib/dashboard/connectionExtras';
import { latestEncounter } from '@/lib/dashboard/connectionEncounters';

// Generate mock connections with full geolocation data following the connection schema
export const mockConnections: ConnectionRecord[] = [
  {
    id: '1',
    name: 'Alex Chen',
    dateMet: new Date('2026-01-15'),
    location: 'UW Red Square',
    context: 'Study Group',
    weatherSummary: 'Cloudy · 43°F',
    noiseSummary: 'Moderate',
    noiseCategory: 'MODERATE',
    status: 'kept',
    geo_location: {
      latitude: 47.6553,
      longitude: -122.3035,
    },
  },
  {
    id: '2',
    name: 'Jordan Smith',
    dateMet: new Date('2026-01-10'),
    location: 'Pike Place Market',
    context: 'Weekend trip',
    status: 'kept',
    geo_location: {
      latitude: 47.6097,
      longitude: -122.3425,
    },
  },
  {
    id: '3',
    name: 'Sam Wilson',
    dateMet: new Date('2026-01-08'),
    location: 'Tech Meetup Seattle',
    context: 'Networking event',
    status: 'pending',
    geo_location: {
      latitude: 47.6205,
      longitude: -122.3493,
    },
  },
  {
    id: '4',
    name: 'Taylor Reed',
    dateMet: new Date('2025-12-20'),
    location: 'Winter Formal',
    context: 'Campus event',
    status: 'expired',
    geo_location: {
      latitude: 47.6534,
      longitude: -122.3076,
    },
  },
  {
    id: '5',
    name: 'Morgan Lee',
    dateMet: new Date('2025-12-15'),
    location: 'Coffee Shop',
    context: 'Random encounter',
    status: 'kept',
    geo_location: {
      latitude: 47.6615,
      longitude: -122.3176,
    },
  },
  {
    id: '6',
    name: 'Casey Johnson',
    dateMet: new Date('2025-11-28'),
    location: 'Thanksgiving Potluck',
    context: 'Friend of friend',
    status: 'kept',
    geo_location: {
      latitude: 47.6695,
      longitude: -122.3456,
    },
  },
  {
    id: '7',
    name: 'Riley Park',
    dateMet: new Date('2025-11-15'),
    location: 'Basketball Court',
    context: 'Pickup game',
    status: 'pending',
    geo_location: {
      latitude: 47.6521,
      longitude: -122.3052,
    },
  },
  {
    id: '8',
    name: 'Quinn Davis',
    dateMet: new Date('2025-10-31'),
    location: 'Halloween Party',
    context: 'Costume party',
    status: 'expired',
    geo_location: {
      latitude: 47.6587,
      longitude: -122.3140,
    },
  },
  {
    id: '9',
    name: 'Avery Martinez',
    dateMet: new Date('2025-10-20'),
    location: 'Hackathon',
    context: 'Same team',
    status: 'kept',
    geo_location: {
      latitude: 47.6549,
      longitude: -122.3054,
    },
  },
  {
    id: '10',
    name: 'Drew Thompson',
    dateMet: new Date('2025-09-25'),
    location: 'Freshman Orientation',
    context: 'Orientation group',
    status: 'kept',
    geo_location: {
      latitude: 47.6553,
      longitude: -122.3035,
    },
  },
];

// Generate mock chapters
export const mockChapters: TimelineChapter[] = [
  {
    id: 'ch-1',
    title: 'Winter Quarter 2026',
    dateRange: {
      start: new Date('2026-01-06'),
      end: new Date('2026-01-31'),
    },
    location: 'University of Washington',
    connectionCount: 8,
    description: 'New semester, new connections! Started the year with energy.',
    highlights: ['Study groups', 'Coffee chats', 'Tech meetups'],
    connections: [mockConnections[0], mockConnections[1], mockConnections[2]],
  },
  {
    id: 'ch-2',
    title: 'Winter Break Adventures',
    dateRange: {
      start: new Date('2025-12-15'),
      end: new Date('2026-01-05'),
    },
    location: 'Seattle',
    connectionCount: 5,
    description: 'Holiday gatherings and spontaneous meetups.',
    highlights: ['Holiday parties', 'Family friends', 'New Year celebrations'],
    connections: [mockConnections[3], mockConnections[4]],
  },
  {
    id: 'ch-3',
    title: 'Fall Quarter Finale',
    dateRange: {
      start: new Date('2025-11-01'),
      end: new Date('2025-12-14'),
    },
    location: 'University of Washington',
    connectionCount: 12,
    description: 'Busy end to the quarter with projects and events.',
    highlights: ['Hackathon', 'Thanksgiving', 'Finals study sessions'],
    connections: [mockConnections[5], mockConnections[6]],
  },
  {
    id: 'ch-4',
    title: 'October Spooky Season',
    dateRange: {
      start: new Date('2025-10-01'),
      end: new Date('2025-10-31'),
    },
    location: 'Seattle Area',
    connectionCount: 7,
    description: 'Halloween vibes and autumn adventures.',
    highlights: ['Costume parties', 'Pumpkin picking', 'Night events'],
    connections: [mockConnections[7], mockConnections[8]],
  },
  {
    id: 'ch-5',
    title: 'Freshman Orientation 2025',
    dateRange: {
      start: new Date('2025-09-15'),
      end: new Date('2025-09-30'),
    },
    location: 'UW Campus',
    connectionCount: 15,
    description: 'The beginning of the college journey. Met so many amazing people!',
    highlights: ['Dawg Daze', 'Dorm meetups', 'Club fairs', 'Campus tours'],
    color: 'from-[#8338EC] to-[#FF6B6B]',
    connections: [mockConnections[9]],
  },
];

/**
 * Convert raw connection data to ConnectionRecord format
 * Handles data from Supabase following the connection schema
 */
export function transformConnection(rawConnection: any, otherUserName?: string): ConnectionRecord {
  const rawLat = rawConnection?.geo_location?.lat ?? rawConnection?.geo_location?.latitude;
  const rawLon = rawConnection?.geo_location?.lon ?? rawConnection?.geo_location?.longitude ?? rawConnection?.geo_location?.lng ?? rawConnection?.geo_location?.long;
  const latitude = typeof rawLat === 'number' ? rawLat : Number(rawLat);
  const longitude = typeof rawLon === 'number' ? rawLon : Number(rawLon);
  const hasValidGeo = Number.isFinite(latitude) && Number.isFinite(longitude) && !(latitude === 0 && longitude === 0);
  const raw = rawConnection as Record<string, unknown>;
  const latest = latestEncounter(raw);
  const semantic =
    (typeof rawConnection.semantic_location === 'string' && rawConnection.semantic_location.trim()
      ? rawConnection.semantic_location.trim()
      : null) ??
    latest?.locationName?.trim() ??
    '';

  return {
    id: rawConnection.id,
    name: otherUserName || semantic || 'Unknown',
    dateMet: new Date(rawConnection.created_utc || rawConnection.created || rawConnection.created_at),
    location: semantic || 'Unknown location',
    context: extractEventContext(raw),
    weatherSummary: extractWeatherSummary(raw),
    noiseSummary: extractNoiseSummary(raw),
    noiseCategory: normalizeNoiseCategory(raw),
    status: rawConnection.status || 'kept',
    source: typeof rawConnection.source === 'string' ? rawConnection.source : 'handshake',
    knownSince: typeof rawConnection.known_since === 'string' ? rawConnection.known_since : null,
    // Include geo_location from the connection schema
    geo_location: hasValidGeo
      ? {
          latitude,
          longitude,
        }
      : undefined,
  };
}

/**
 * Generate chapters from connections automatically
 */
export function generateChaptersFromConnections(connections: ConnectionRecord[]): TimelineChapter[] {
  // Group by month
  const monthGroups: Map<string, ConnectionRecord[]> = new Map();
  
  connections.forEach(conn => {
    const monthKey = `${conn.dateMet.getFullYear()}-${conn.dateMet.getMonth()}`;
    if (!monthGroups.has(monthKey)) {
      monthGroups.set(monthKey, []);
    }
    monthGroups.get(monthKey)!.push(conn);
  });

  // Convert to chapters
  const chapters: TimelineChapter[] = [];
  monthGroups.forEach((conns, monthKey) => {
    const [year, month] = monthKey.split('-').map(Number);
    const monthName = new Date(year, month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    
    // Get unique locations
    const locations = [...new Set(conns.map(c => c.location))];
    
    chapters.push({
      id: monthKey,
      title: monthName,
      dateRange: {
        start: new Date(year, month, 1),
        end: new Date(year, month + 1, 0),
      },
      location: locations.length <= 2 ? locations.join(', ') : `${locations.length} locations`,
      connectionCount: conns.length,
      description: `${pluralize(conns.length, 'new connection')} made this month`,
      highlights: locations.slice(0, 4),
      connections: conns,
    });
  });

  // Sort by date descending
  chapters.sort((a, b) => b.dateRange.start.getTime() - a.dateRange.start.getTime());
  
  return chapters;
}

/**
 * Export connections to CSV format
 */
export function exportToCSV(connections: ConnectionRecord[]): string {
  const headers = ['Name', 'Date Met', 'Location', 'Event / context', 'Weather', 'Noise', 'Status'];
  const rows = connections.map(conn => [
    conn.name,
    conn.dateMet.toISOString().split('T')[0],
    conn.location,
    conn.context || '',
    conn.weatherSummary || '',
    conn.noiseSummary || '',
    conn.status,
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(',')),
  ].join('\n');

  return csvContent;
}

/**
 * Download CSV file
 */
export function downloadCSV(connections: ConnectionRecord[], filename = 'click-connections') {
  const csvContent = exportToCSV(connections);
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}-${new Date().toISOString().split('T')[0]}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
