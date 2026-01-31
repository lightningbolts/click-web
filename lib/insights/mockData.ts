/**
 * Mock data for Click Insights Dashboard
 * This file contains sample data for development and testing
 */

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
    color: '#8338EC',
    connections: 156,
    overlap: ['vinyl-collectors', 'festival-goers'],
  },
  {
    id: 'tech-startup',
    name: 'Tech',
    size: 38,
    x: 55,
    y: 45,
    color: '#3A86FF',
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
