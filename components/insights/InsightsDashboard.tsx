'use client';

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { motion } from 'framer-motion';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell
} from 'recharts';
import { Users, Calendar, TrendingUp, Clock, AlertCircle, BarChart3, Activity, Zap, RefreshCw, Download, Settings } from 'lucide-react';
import LoadingScreen from '@/components/LoadingScreen';

// Import Click Insights Dashboard Components
import { StickyScoreCard, ConnectionDensityCard, LiveCountCard } from './StickyScoreCard';
import HeatmapView from './HeatmapView';
import TribeChart from './TribeChart';
import VibeStream from './VibeStream';

// Import mock data
import {
  mockStickyScore,
  mockConnectionDensity,
  mockLiveCount,
  mockHeatmapZones,
  mockTribes,
  mockVibeStream,
  generateLiveUpdate,
} from '@/lib/insights/mockData';

interface InsightsResponse {
  totalConnections: number;
  hourlyDistribution: number[];
  dailyData: { date: string; count: number }[];
  peakHour: number;
  retentionRate: string;
  busiestDay: string;
  status?: string;
  message?: string;
}

interface InsightsDashboardProps {
  venueName?: string;
  lastUpdated?: Date;
  isLive?: boolean;
  refreshKey?: number;
  onLastUpdatedChange?: (date: Date) => void;
  onRefresh?: () => void;
}

interface InsightsDashboardContentProps {
  onLastUpdatedChange?: (date: Date) => void;
  refreshKey?: number;
}

const fetcher = (url: string) => fetch(url).then((res) => {
  if (!res.ok) {
    const error = new Error('An error occurred while fetching the data.');
    // @ts-ignore
    error.info = res.json();
    // @ts-ignore
    error.status = res.status;
    throw error;
  }
  return res.json();
});

/**
 * InsightsDashboard - The main content component for the Insights page
 * Contains all the bento box cards and charts
 */
function InsightsDashboardContent({ onLastUpdatedChange, refreshKey }: InsightsDashboardContentProps) {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  
  const [liveCount, setLiveCount] = useState(mockLiveCount);
  const [vibeMessages, setVibeMessages] = useState(mockVibeStream);

  const { data, error, isLoading, mutate } = useSWR<InsightsResponse>(
    user ? '/api/insights/venue' : null,
    fetcher
  );

  // Simulate real-time updates
  useEffect(() => {
    const interval = setInterval(() => {
      const update = generateLiveUpdate();
      if (update.liveCount) {
        setLiveCount(update.liveCount);
      }
      onLastUpdatedChange?.(new Date());
    }, 5000);

    return () => clearInterval(interval);
  }, [onLastUpdatedChange]);

  // Handle refresh from parent
  useEffect(() => {
    if (refreshKey !== undefined) {
      mutate();
    }
  }, [refreshKey, mutate]);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/');
    }
  }, [user, authLoading, router]);

  if (authLoading || (isLoading && !error)) {
    return <LoadingScreen />;
  }

  if (error) {
    if (error.status === 403) {
      return (
        <div className="flex items-center justify-center p-4 min-h-[400px]">
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white/5 backdrop-blur-md border border-white/10 p-8 rounded-3xl max-w-md text-center"
          >
            <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-white mb-2">Access Denied</h1>
            <p className="text-zinc-400 mb-6">
              This dashboard is only available to verified business partners.
            </p>
            <button
              onClick={() => router.push('/dashboard')}
              className="bg-[#8338EC] hover:bg-[#8338EC]/80 text-white px-6 py-3 rounded-xl transition-colors"
            >
              Go to User Dashboard
            </button>
          </motion.div>
        </div>
      );
    }
  }

  if (data?.status === 'insufficient_data') {
    return (
      <div className="flex items-center justify-center p-4 min-h-[400px]">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white/5 backdrop-blur-md border border-white/10 p-8 rounded-3xl max-w-md text-center"
        >
          <Users className="w-16 h-16 text-zinc-600 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-white mb-2">Insufficient Data</h1>
          <p className="text-zinc-400 mb-6">
            {data.message || "We need at least 5 connections to generate insights to protect user privacy."}
          </p>
          <button
            onClick={() => router.push('/dashboard')}
            className="bg-[#8338EC] hover:bg-[#8338EC]/80 text-white px-6 py-3 rounded-xl transition-colors"
          >
            Back to Dashboard
          </button>
        </motion.div>
      </div>
    );
  }

  // Prepare data for charts
  const hourlyData = data?.hourlyDistribution?.map((count: number, hour: number) => ({
    hour: `${hour}:00`,
    count,
  })) || [];

  // Animation variants for staggered entry
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 },
  };

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      {/* TOP ROW: Metric Cards */}
      <motion.div 
        variants={itemVariants}
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6"
      >
        <StickyScoreCard data={mockStickyScore} />
        <ConnectionDensityCard data={mockConnectionDensity} />
        <LiveCountCard data={liveCount} />
      </motion.div>

      {/* SECOND ROW: Heatmap + Tribe Analysis */}
      <motion.div 
        variants={itemVariants}
        className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6"
      >
        <HeatmapView zones={mockHeatmapZones} />
        <TribeChart tribes={mockTribes} />
      </motion.div>

      {/* THIRD ROW: Historical Charts + Vibe Stream */}
      <motion.div 
        variants={itemVariants}
        className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6"
      >
        {/* Main Chart - Social Activity */}
        <GlassPanel className="lg:col-span-2 p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-[#8338EC]/20 rounded-lg">
                <Activity className="w-4 h-4 text-[#8338EC]" />
              </div>
              <span className="text-sm font-medium text-zinc-400">Social Activity</span>
            </div>
            <span className="text-xs text-zinc-500">Last 30 days</span>
          </div>
          <div className="h-[280px] w-full min-h-[280px]" style={{ minWidth: '200px' }}>
            <ResponsiveContainer width="100%" height="100%" minWidth={200} minHeight={200}>
              <LineChart data={data?.dailyData || []}>
                <defs>
                  <linearGradient id="colorGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8338EC" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#8338EC" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis 
                  dataKey="date" 
                  stroke="rgba(255,255,255,0.2)" 
                  tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }}
                  tickFormatter={(value) => new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                />
                <YAxis 
                  stroke="rgba(255,255,255,0.2)" 
                  tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }}
                  axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'rgba(0,0,0,0.9)', 
                    borderColor: 'rgba(255,255,255,0.1)', 
                    borderRadius: '12px',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
                  }}
                  itemStyle={{ color: '#fff' }}
                  labelStyle={{ color: 'rgba(255,255,255,0.6)' }}
                />
                <Line 
                  type="monotone" 
                  dataKey="count" 
                  stroke="#8338EC" 
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ 
                    r: 6, 
                    fill: '#8338EC',
                    stroke: '#fff',
                    strokeWidth: 2,
                    style: { filter: 'drop-shadow(0 0 8px rgba(131, 56, 236, 0.8))' }
                  }}
                  style={{ filter: 'drop-shadow(0 0 8px rgba(131, 56, 236, 0.5))' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </GlassPanel>

        {/* Vibe Stream */}
        <VibeStream messages={vibeMessages} />
      </motion.div>

      {/* FOURTH ROW: Additional Analytics */}
      <motion.div 
        variants={itemVariants}
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6"
      >
        <GlassPanel className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-[#8338EC]/20 rounded-lg">
              <Users className="w-4 h-4 text-[#8338EC]" />
            </div>
            <span className="text-sm font-medium text-zinc-400">Total Connections</span>
          </div>
          <div className="text-3xl font-bold text-white">{data?.totalConnections || 0}</div>
          <div className="text-xs text-zinc-500 mt-2">Last 30 days</div>
        </GlassPanel>

        <GlassPanel className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-green-500/20 rounded-lg">
              <TrendingUp className="w-4 h-4 text-green-500" />
            </div>
            <span className="text-sm font-medium text-zinc-400">Retention Rate</span>
          </div>
          <div className="text-3xl font-bold text-white">{data?.retentionRate || 'N/A'}</div>
          <div className="text-xs text-zinc-500 mt-2">Returning visitors</div>
        </GlassPanel>

        <GlassPanel className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-orange-500/20 rounded-lg">
              <Calendar className="w-4 h-4 text-orange-500" />
            </div>
            <span className="text-sm font-medium text-zinc-400">Busiest Day</span>
          </div>
          <div className="text-2xl font-bold text-white">{data?.busiestDay || 'N/A'}</div>
          <div className="text-xs text-zinc-500 mt-2">Highest activity</div>
        </GlassPanel>

        <GlassPanel className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-[#3A86FF]/20 rounded-lg">
              <Clock className="w-4 h-4 text-[#3A86FF]" />
            </div>
            <span className="text-sm font-medium text-zinc-400">Peak Hour</span>
          </div>
          <div className="text-3xl font-bold text-white">{data?.peakHour ?? 'N/A'}:00</div>
          <div className="text-xs text-zinc-500 mt-2">Most active time</div>
        </GlassPanel>
      </motion.div>

      {/* FIFTH ROW: Popular Times Chart */}
      <motion.div variants={itemVariants}>
        <GlassPanel className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-[#3A86FF]/20 rounded-lg">
                <BarChart3 className="w-4 h-4 text-[#3A86FF]" />
              </div>
              <span className="text-sm font-medium text-zinc-400">Popular Times</span>
            </div>
            <span className="text-xs text-zinc-500">Hourly distribution</span>
          </div>
          <div className="h-[200px] w-full min-h-[200px]" style={{ minWidth: '200px' }}>
            <ResponsiveContainer width="100%" height="100%" minWidth={200} minHeight={150}>
              <BarChart data={hourlyData}>
                <XAxis 
                  dataKey="hour" 
                  stroke="rgba(255,255,255,0.2)" 
                  tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10 }} 
                  interval={2}
                  axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                />
                <Tooltip 
                  cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                  contentStyle={{ 
                    backgroundColor: 'rgba(0,0,0,0.9)', 
                    borderColor: 'rgba(255,255,255,0.1)', 
                    borderRadius: '12px' 
                  }}
                  itemStyle={{ color: '#fff' }}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {hourlyData.map((entry: any, index: number) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={index === data?.peakHour ? '#8338EC' : 'rgba(255,255,255,0.15)'} 
                      style={index === data?.peakHour ? { filter: 'drop-shadow(0 0 8px rgba(131, 56, 236, 0.5))' } : {}}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 text-center text-xs text-zinc-400">
            Peak activity is around <span className="text-[#8338EC] font-bold">{data?.peakHour}:00</span>
          </div>
        </GlassPanel>
      </motion.div>
    </motion.div>
  );
}

/**
 * InsightsDashboard - Consolidated shell + dashboard content
 */
export default function InsightsDashboard({
  venueName = 'The Neon Lounge',
  lastUpdated,
  onRefresh,
  isLive = true,
  refreshKey,
  onLastUpdatedChange,
}: InsightsDashboardProps) {
  return (
    <InsightShell
      venueName={venueName}
      lastUpdated={lastUpdated}
      onRefresh={onRefresh}
      isLive={isLive}
    >
      <InsightsDashboardContent
        key={refreshKey}
        refreshKey={refreshKey}
        onLastUpdatedChange={onLastUpdatedChange}
      />
    </InsightShell>
  );
}

interface InsightShellProps {
  children: ReactNode;
  venueName?: string;
  lastUpdated?: Date;
  onRefresh?: () => void;
  isLive?: boolean;
}

/**
 * InsightShell - Main layout wrapper for the Click Insights Dashboard
 * Provides the "Glass Cockpit" aesthetic with bento box grid layout
 */
function InsightShell({
  children,
  venueName = 'The Neon Lounge',
  lastUpdated,
  onRefresh,
  isLive = true,
}: InsightShellProps) {
  const formatLastUpdated = (date?: Date) => {
    if (!date) return 'Just now';
    const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    return date.toLocaleTimeString();
  };

  return (
    <div className="min-h-screen bg-[#121212] text-white relative">
      {/* Ambient background gradient */}
      <div className="fixed inset-0 pointer-events-none -z-10">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-[#8338EC]/10 rounded-full blur-[128px]" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-[#3A86FF]/10 rounded-full blur-[128px]" />
      </div>

      {/* Main content */}
      <div className="relative p-4 md:p-6 lg:p-8">
        <div className="max-w-[1800px] mx-auto">
          {/* Header */}
          <motion.header
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mb-6 md:mb-8"
          >
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              {/* Title Section */}
              <div className="flex items-center gap-4">
                <div className="relative">
                  <motion.div
                    animate={{
                      boxShadow: isLive
                        ? ['0 0 20px rgba(131, 56, 236, 0.5)', '0 0 40px rgba(131, 56, 236, 0.8)', '0 0 20px rgba(131, 56, 236, 0.5)']
                        : '0 0 0px rgba(131, 56, 236, 0)'
                    }}
                    transition={{ duration: 2, repeat: Infinity }}
                    className="p-3 bg-[#8338EC]/20 rounded-xl border border-[#8338EC]/30"
                  >
                    <Zap className="w-6 h-6 text-[#8338EC]" />
                  </motion.div>
                  {isLive && (
                    <span className="absolute -top-1 -right-1 flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                    </span>
                  )}
                </div>
                <div>
                  <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
                    <span className="bg-gradient-to-r from-white via-white to-zinc-400 bg-clip-text text-transparent">
                      Click Insights
                    </span>
                  </h1>
                  <p className="text-zinc-500 text-sm md:text-base">
                    {venueName} • {isLive ? 'Live' : 'Offline'} Dashboard
                  </p>
                </div>
              </div>

              {/* Controls Section */}
              <div className="flex items-center gap-3">
                {/* Last Updated Badge */}
                <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-white/5 rounded-lg border border-white/10">
                  <div className={`w-2 h-2 rounded-full ${isLive ? 'bg-green-500 animate-pulse' : 'bg-zinc-500'}`} />
                  <span className="text-xs text-zinc-400">
                    Updated {formatLastUpdated(lastUpdated)}
                  </span>
                </div>

                {/* Action Buttons */}
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={onRefresh}
                  className="p-2.5 bg-white/5 hover:bg-white/10 rounded-xl border border-white/10 transition-colors group"
                  title="Refresh data"
                >
                  <RefreshCw className="w-4 h-4 text-zinc-400 group-hover:text-white transition-colors" />
                </motion.button>

                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="p-2.5 bg-white/5 hover:bg-white/10 rounded-xl border border-white/10 transition-colors group"
                  title="Export data"
                >
                  <Download className="w-4 h-4 text-zinc-400 group-hover:text-white transition-colors" />
                </motion.button>

                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="p-2.5 bg-white/5 hover:bg-white/10 rounded-xl border border-white/10 transition-colors group"
                  title="Settings"
                >
                  <Settings className="w-4 h-4 text-zinc-400 group-hover:text-white transition-colors" />
                </motion.button>
              </div>
            </div>
          </motion.header>

          {/* Bento Grid Container */}
          <motion.main
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            {children}
          </motion.main>

          {/* Footer */}
          <footer className="mt-8 text-center">
            <p className="text-xs text-zinc-600">
              Data is anonymized and aggregated to protect user privacy
            </p>
          </footer>
        </div>
      </div>
    </div>
  );
}

/**
 * GlassPanel - Reusable glassmorphism panel component
 */
interface GlassPanelProps {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  glow?: 'purple' | 'blue' | 'green' | 'none';
}

export function GlassPanel({
  children,
  className = '',
  hover = true,
  glow = 'none'
}: GlassPanelProps) {
  const glowColors = {
    purple: 'hover:shadow-[0_0_30px_-5px_rgba(131,56,236,0.3)]',
    blue: 'hover:shadow-[0_0_30px_-5px_rgba(58,134,255,0.3)]',
    green: 'hover:shadow-[0_0_30px_-5px_rgba(34,197,94,0.3)]',
    none: '',
  };

  return (
    <motion.div
      whileHover={hover ? { scale: 1.01, y: -2 } : undefined}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      className={
        `
        bg-white/5 backdrop-blur-md 
        border border-white/10 
        rounded-2xl 
        transition-all duration-300
        ${hover ? 'hover:bg-white/[0.07] hover:border-white/20' : ''}
        ${glowColors[glow]}
        ${className}
      `
      }
    >
      {children}
    </motion.div>
  );
}