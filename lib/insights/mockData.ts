/**
 * Mock data for Click Insights Dashboard
 * This file contains sample data for development and testing
 */

import type { AdvancedMetricsApiResponse } from "@/lib/insights/advancedMetrics";

// ============================================
// TYPE DEFINITIONS
// ============================================

export interface StickyScore {
  score: number; // 0-100
  trend: 'up' | 'down' | 'stable';
  change: number; // percentage change from last period
  breakdown: {
    repeatVisitors: number;
    avgConnectionsPerVisit: number;
    communityEngagement: number;
  };
}

export interface ConnectionDensity {
  value: number; // connections per 100 sq ft
  totalArea: number; // venue area in sq ft
  activeZones: number;
  trend: 'up' | 'down' | 'stable';
}

export interface LiveCount {
  current: number;
  peak: number;
  peakTime: string;
  capacity: number;
  trend: number[]; // last 12 readings (every 5 mins = 1 hour)
}

export interface HeatmapZone {
  id: string;
  name: string;
  x: number; // percentage position
  y: number; // percentage position
  width: number; // percentage width
  height: number; // percentage height
  connections: number;
  intensity: number; // 0-1 heat intensity
  type: 'bar' | 'dance' | 'lounge' | 'stage' | 'entrance' | 'vip';
}

export interface TribeBubble {
  id: string;
  name: string;
  size: number; // relative size (member count)
  x: number; // position for layout
  y: number;
  color: string;
  connections: number; // connections within tribe
  overlap?: string[]; // IDs of overlapping tribes
  /** Verified clique members on-premise (B2B micro-community). */
  isMicroCommunity?: boolean;
  /** Aggregated interest tags for this micro-community (no user IDs). */
  interestTags?: { tag: string; count: number }[];
}

export interface VibeMessage {
  id: string;
  timestamp: Date;
  message: string;
  sentiment: 'positive' | 'negative' | 'neutral';
  category: 'music' | 'atmosphere' | 'crowd' | 'service' | 'general';
  icon?: string;
}

export interface VenueInsights {
  stickyScore: StickyScore;
  connectionDensity: ConnectionDensity;
  liveCount: LiveCount;
  heatmapZones: HeatmapZone[];
  tribes: TribeBubble[];
  vibeStream: VibeMessage[];
  lastUpdated: Date;
}

// ============================================
// MOCK DATA
// ============================================

export const mockStickyScore: StickyScore = {
  score: 78,
  trend: 'up',
  change: 12,
  breakdown: {
    repeatVisitors: 45,
    avgConnectionsPerVisit: 3.2,
    communityEngagement: 82,
  },
};

export const mockConnectionDensity: ConnectionDensity = {
  value: 8.4,
  totalArea: 2500,
  activeZones: 6,
  trend: 'up',
};

export const mockLiveCount: LiveCount = {
  current: 142,
  peak: 287,
  peakTime: '11:30 PM',
  capacity: 350,
  trend: [45, 67, 89, 112, 134, 156, 178, 165, 154, 148, 145, 142],
};

export const mockHeatmapZones: HeatmapZone[] = [
  {
    id: 'bar-main',
    name: 'Main Bar',
    x: 60,
    y: 10,
    width: 35,
    height: 20,
    connections: 45,
    intensity: 0.9,
    type: 'bar',
  },
  {
    id: 'dance-floor',
    name: 'Dance Floor',
    x: 25,
    y: 35,
    width: 50,
    height: 35,
    connections: 78,
    intensity: 1.0,
    type: 'dance',
  },
  {
    id: 'lounge-left',
    name: 'Lounge Area',
    x: 5,
    y: 10,
    width: 25,
    height: 25,
    connections: 23,
    intensity: 0.5,
    type: 'lounge',
  },
  {
    id: 'stage',
    name: 'Stage',
    x: 25,
    y: 75,
    width: 50,
    height: 20,
    connections: 12,
    intensity: 0.3,
    type: 'stage',
  },
  {
    id: 'entrance',
    name: 'Entrance',
    x: 40,
    y: 0,
    width: 20,
    height: 10,
    connections: 8,
    intensity: 0.2,
    type: 'entrance',
  },
  {
    id: 'vip',
    name: 'VIP Section',
    x: 80,
    y: 35,
    width: 18,
    height: 30,
    connections: 34,
    intensity: 0.7,
    type: 'vip',
  },
];

export const mockTribes: TribeBubble[] = [
  {
    id: 'indie-rock',
    name: 'Indie Rock',
    size: 45,
    x: 30,
    y: 35,
    color: '#630ed4',
    connections: 156,
    overlap: ['vinyl-collectors', 'festival-goers'],
  },
  {
    id: 'tech-startup',
    name: 'Tech',
    size: 38,
    x: 55,
    y: 45,
    color: '#630ed4',
    connections: 134,
    overlap: ['crypto', 'startup-founders'],
  },
  {
    id: 'hikers',
    name: 'Hikers',
    size: 28,
    x: 70,
    y: 30,
    color: '#06D6A0',
    connections: 89,
    overlap: ['photographers'],
  },
  {
    id: 'foodies',
    name: 'Foodies',
    size: 52,
    x: 40,
    y: 60,
    color: '#FF6B6B',
    connections: 178,
    overlap: ['wine-enthusiasts', 'travelers'],
  },
  {
    id: 'vinyl-collectors',
    name: 'Vinyl',
    size: 22,
    x: 20,
    y: 50,
    color: '#FFD93D',
    connections: 67,
    overlap: ['indie-rock'],
  },
  {
    id: 'photographers',
    name: 'Photography',
    size: 30,
    x: 65,
    y: 55,
    color: '#C77DFF',
    connections: 98,
    overlap: ['hikers', 'travelers'],
  },
  {
    id: 'fitness',
    name: 'Fitness',
    size: 35,
    x: 80,
    y: 50,
    color: '#00F5D4',
    connections: 112,
    overlap: ['hikers'],
  },
  {
    id: 'gamers',
    name: 'Gamers',
    size: 40,
    x: 25,
    y: 70,
    color: '#FF006E',
    connections: 145,
    overlap: ['tech-startup'],
  },
];

export const mockVibeStream: VibeMessage[] = [
  {
    id: '1',
    timestamp: new Date(Date.now() - 30000),
    message: 'Great energy tonight! 🔥',
    sentiment: 'positive',
    category: 'atmosphere',
  },
  {
    id: '2',
    timestamp: new Date(Date.now() - 120000),
    message: 'Music too loud near speakers',
    sentiment: 'negative',
    category: 'music',
  },
  {
    id: '3',
    timestamp: new Date(Date.now() - 180000),
    message: 'Love the lighting setup',
    sentiment: 'positive',
    category: 'atmosphere',
  },
  {
    id: '4',
    timestamp: new Date(Date.now() - 240000),
    message: 'Getting crowded at the bar',
    sentiment: 'neutral',
    category: 'crowd',
  },
  {
    id: '5',
    timestamp: new Date(Date.now() - 300000),
    message: 'DJ killing it! 🎵',
    sentiment: 'positive',
    category: 'music',
  },
  {
    id: '6',
    timestamp: new Date(Date.now() - 360000),
    message: 'Wait time too long for drinks',
    sentiment: 'negative',
    category: 'service',
  },
  {
    id: '7',
    timestamp: new Date(Date.now() - 420000),
    message: 'Perfect vibe for networking',
    sentiment: 'positive',
    category: 'atmosphere',
  },
  {
    id: '8',
    timestamp: new Date(Date.now() - 480000),
    message: 'Could use more seating',
    sentiment: 'neutral',
    category: 'general',
  },
  {
    id: '9',
    timestamp: new Date(Date.now() - 540000),
    message: 'Bathroom needs attention',
    sentiment: 'negative',
    category: 'service',
  },
  {
    id: '10',
    timestamp: new Date(Date.now() - 600000),
    message: 'Best Thursday spot in the city!',
    sentiment: 'positive',
    category: 'general',
  },
];

/** Neutral placeholders when the user has no venue data yet (no fake sample metrics). */
export const emptyStickyScore: StickyScore = {
  score: 0,
  trend: 'stable',
  change: 0,
  breakdown: {
    repeatVisitors: 0,
    avgConnectionsPerVisit: 0,
    communityEngagement: 0,
  },
};

export const emptyConnectionDensity: ConnectionDensity = {
  value: 0,
  totalArea: 0,
  activeZones: 0,
  trend: 'stable',
};

export const emptyLiveCount: LiveCount = {
  current: 0,
  peak: 0,
  peakTime: '—',
  capacity: 1,
  trend: Array(12).fill(0),
};

// Combined mock data export
export const mockVenueInsights: VenueInsights = {
  stickyScore: mockStickyScore,
  connectionDensity: mockConnectionDensity,
  liveCount: mockLiveCount,
  heatmapZones: mockHeatmapZones,
  tribes: mockTribes,
  vibeStream: mockVibeStream,
  lastUpdated: new Date(),
};

// Utility function to simulate real-time updates
export const generateLiveUpdate = (): Partial<VenueInsights> => {
  const currentCount = mockLiveCount.current + Math.floor(Math.random() * 10 - 5);
  return {
    liveCount: {
      ...mockLiveCount,
      current: Math.max(0, Math.min(currentCount, mockLiveCount.capacity)),
      trend: [...mockLiveCount.trend.slice(1), currentCount],
    },
    lastUpdated: new Date(),
  };
};

// --- Demo overlay: charts + advanced metrics (deterministic) ---

const DEMO_DAY_UTC = Date.UTC(2026, 0, 1);

export const mockInsightsDailyData: { date: string; count: number }[] = Array.from(
  { length: 30 },
  (_, i) => {
    const d = new Date(DEMO_DAY_UTC + i * 86400000);
    return {
      date: d.toISOString().slice(0, 10),
      count: 12 + ((i * 11) % 28),
    };
  },
);

export const mockInsightsHourlyDistribution: number[] = Array.from({ length: 24 }, (_, h) => {
  if (h >= 21 || h <= 1) return 18 + (h % 4);
  if (h >= 10 && h <= 14) return 8 + h;
  return 4 + (h % 6);
});

export const mockInsightsPeakHour = mockInsightsHourlyDistribution.indexOf(
  Math.max(...mockInsightsHourlyDistribution),
);

/** Sample advanced metrics for demo / empty-venue dashboard (matches `AdvancedMetricsApiResponse`). */
export const mockAdvancedMetrics: AdvancedMetricsApiResponse = {
  venueId: "demo",
  venueLoyaltyCoefficient: 35,
  anchorMagnetism: [
    {
      nfc_anchor_id: "demo-entrance",
      name: "Main entrance",
      connection_count: 120,
      total_count: 200,
      anchor_retention: 40,
      ams_score: 0.42,
    },
    {
      nfc_anchor_id: "demo-bar",
      name: "Bar tap",
      connection_count: 98,
      total_count: 180,
      anchor_retention: 35,
      ams_score: 0.31,
    },
    {
      nfc_anchor_id: "demo-stage",
      name: "Stage side",
      connection_count: 64,
      total_count: 150,
      anchor_retention: 28,
      ams_score: 0.18,
    },
  ],
  acousticConversion: { quiet: 22, moderate: 45, loud: 18 },
  crossPollinationRate: 28,
  weatherResilience: {
    index: 0.88,
    avgDailyAdverse: 12,
    avgDailyFair: 14,
    adverseDays: 8,
    fairDays: 22,
  },
  peakSocialVelocity: {
    peakHour: 23,
    velocity: 2.2,
    hourlyAverages: Array.from({ length: 24 }, (_, h) =>
      Math.max(0.5, 4 + Math.sin(h / 4) * 3 + (h === 23 ? 4 : 0)),
    ),
    numDistinctDays: 28,
    totalConnections: 420,
  },
  groupClusteringRate: 45,
  peerPercentiles: {
    cohortSize: 48,
    vlc: 62,
    gcr: 55,
    psv_velocity: 71,
    wri: 58,
  },
};

/** Demo aggregates for /insights/event-engagement. */
export const mockEventEngagement = {
  venue_id: "demo",
  funnel: {
    impressions: 420,
    unique_viewers: 180,
    bookmarks: 96,
    shares: 48,
    rsvps: 74,
    check_ins: 51,
    check_outs: 38,
    interest_rate: 96 / 420,
    share_rate: 48 / 420,
    rsvp_conversion: 74 / 420,
    rsvp_to_check_in: 51 / 74,
  },
  arrival_histogram: [
    { bucket: "early", count: 8 },
    { bucket: "0_30", count: 22 },
    { bucket: "30_60", count: 12 },
    { bucket: "60_plus", count: 6 },
    { bucket: "unknown", count: 3 },
  ],
  reject_reasons: [
    { reason: "out_of_bounds", count: 14 },
    { reason: "not_live", count: 9 },
    { reason: "no_location", count: 5 },
  ],
  dwell: {
    sample_size: 38,
    p50_minutes: 42,
    p90_minutes: 95,
  },
};
