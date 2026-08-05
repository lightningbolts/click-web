'use client';

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useSearchParams } from 'next/navigation';
import { Radio, Users, Zap, BarChart3 } from 'lucide-react';
import { GlassPanel } from '@/components/insights/GlassPanel';
import { LiveCountCard } from '@/components/insights/StickyScoreCard';
import {
  emptyLiveCount,
  mockInsightsHourlyDistribution,
  mockInsightsPeakHour,
  mockVenueInsights,
} from '@/lib/insights/mockData';
import type { LiveCount } from '@/lib/insights/mockData';
import { useInsightsDemo } from '@/components/insights/InsightsDemoContext';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  AreaChart,
  Area,
  ReferenceLine,
} from 'recharts';
import useSWR from 'swr';
import { fetchInsightsApiJson } from '@/lib/insights/fetchInsightsApi';
import { useAuth } from '@/lib/AuthContext';
import { useInsightsChartTheme } from '@/lib/theme/insightsChartTheme';

interface InsightsResponse {
  hourlyDistribution: number[];
  peakHour: number;
  liveCount?: LiveCount;
  status?: string;
  message?: string;
}

const fetcher = (url: string) => fetchInsightsApiJson<InsightsResponse>(url);

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.08 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0 },
};

export default function LiveMetricsPage() {
  const { user } = useAuth();
  const chart = useInsightsChartTheme();
  const searchParams = useSearchParams();
  const venueId = searchParams.get('venue_id') ?? undefined;
  const insightsUrl = venueId ? `/api/insights/${venueId}` : '/api/insights/venue';
  const { data } = useSWR<InsightsResponse>(user ? insightsUrl : null, fetcher);

  const { demoMode } = useInsightsDemo();
  const isDemoFallback =
    demoMode &&
    !!data &&
    (data.status === 'no_venue' || data.status === 'insufficient_data');

  const liveCount: LiveCount = useMemo(
    () =>
      isDemoFallback ? mockVenueInsights.liveCount : (data?.liveCount ?? emptyLiveCount),
    [isDemoFallback, data?.liveCount],
  );

  const peakHourDisplay = isDemoFallback ? mockInsightsPeakHour : (data?.peakHour ?? -1);
  const hourlySource = isDemoFallback
    ? mockInsightsHourlyDistribution
    : (data?.hourlyDistribution ?? []);

  const fillPct = Math.round((liveCount.current / Math.max(liveCount.capacity, 1)) * 100);
  const capacityColor =
    fillPct >= 90 ? '#ef4444' : fillPct >= 70 ? '#f59e0b' : fillPct >= 40 ? '#22c55e' : '#3A86FF';

  const hourlyData = hourlySource.map((count, hour) => ({
    hour: `${hour}:00`,
    count,
    isHour: hour,
  }));

  const trendData = liveCount.trend.map((val, i) => ({
    t: `${(i + 1) * 5}m`,
    count: val,
  }));

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      {data?.status === 'no_venue' && data.message ? (
        <motion.div
          variants={itemVariants}
          className="rounded-2xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-100"
        >
          {data.message}
        </motion.div>
      ) : null}

      {data?.status === 'insufficient_data' && data.message ? (
        <motion.div
          variants={itemVariants}
          className="rounded-2xl border border-zinc-500/30 bg-zinc-500/10 px-4 py-3 text-sm text-on-surface"
        >
          {data.message}
        </motion.div>
      ) : null}

      {/* Header */}
      <motion.div variants={itemVariants} className="flex items-center gap-3 mb-2">
        <div className="p-2.5 bg-green-500/20 rounded-xl border border-green-500/30">
          <Radio className="w-5 h-5 text-green-700 dark:text-green-400" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-on-surface">Live Metrics</h2>
          <p className="text-sm text-on-surface-variant">Real-time occupancy, capacity, and crowd trends</p>
        </div>
      </motion.div>

      {/* Top row: live count card + capacity gauge + stats */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <LiveCountCard data={liveCount} />

        {/* Capacity gauge */}
        <GlassPanel className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="p-2 bg-green-500/20 rounded-lg">
              <Users className="w-4 h-4 text-green-700 dark:text-green-400" />
            </div>
            <span className="text-sm font-medium text-on-surface-variant">Capacity Usage</span>
          </div>

          {/* Large percentage display */}
          <div className="flex flex-col items-center justify-center py-4">
            <div className="relative w-36 h-36">
              <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                <circle cx="50" cy="50" r="42" fill="none" stroke={chart.track} strokeWidth="10" />
                <motion.circle
                  cx="50"
                  cy="50"
                  r="42"
                  fill="none"
                  stroke={capacityColor}
                  strokeWidth="10"
                  strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 42}`}
                  initial={{ strokeDashoffset: 2 * Math.PI * 42 }}
                  animate={{ strokeDashoffset: 2 * Math.PI * 42 * (1 - fillPct / 100) }}
                  transition={{ duration: 1, ease: 'easeOut' }}
                  style={{ filter: `drop-shadow(0 0 8px ${capacityColor}80)` }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-bold text-on-surface">{fillPct}%</span>
                <span className="text-xs text-on-surface-variant">capacity</span>
              </div>
            </div>
          </div>

          <div className="flex justify-between text-xs text-on-surface-variant pt-2 border-t border-border-hard">
            <span>{liveCount.current} present</span>
            <span>{Math.max(0, liveCount.capacity - liveCount.current)} remaining</span>
          </div>
        </GlassPanel>

        {/* Peak stats */}
        <GlassPanel className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="p-2 bg-[#8338EC]/20 rounded-lg">
              <Zap className="w-4 h-4 text-[#8338EC]" />
            </div>
            <span className="text-sm font-medium text-on-surface-variant">Peak Stats</span>
          </div>
          <div className="space-y-4">
            <div>
              <div className="text-xs text-on-surface-variant mb-1">Session peak count</div>
              <div className="text-3xl font-bold text-on-surface">{liveCount.peak}</div>
            </div>
            <div className="h-px bg-surface-container" />
            <div>
              <div className="text-xs text-on-surface-variant mb-1">Peak bucket</div>
              <div className="text-2xl font-bold text-on-surface">{liveCount.peakTime}</div>
            </div>
            <div className="h-px bg-surface-container" />
            <div>
              <div className="text-xs text-on-surface-variant mb-1">Estimated capacity</div>
              <div className="text-2xl font-bold text-on-surface">{liveCount.capacity}</div>
            </div>
          </div>
        </GlassPanel>
      </motion.div>

      {/* Last-hour trend sparkline */}
      <motion.div variants={itemVariants}>
        <GlassPanel className="p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-base font-semibold text-on-surface">Last-Hour Occupancy Trend</h3>
              <p className="text-xs text-on-surface-variant mt-0.5">5-minute buckets over the last hour</p>
            </div>
            <span className="flex items-center gap-1.5 text-xs text-green-700 dark:text-green-400">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              Live
            </span>
          </div>
          <div className="h-[200px] w-full min-w-0">
            <ResponsiveContainer width="100%" height={200} minWidth={0} minHeight={180}>
              <AreaChart data={trendData}>
                <defs>
                  <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={capacityColor} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={capacityColor} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} vertical={false} />
                <XAxis
                  dataKey="t"
                  stroke={chart.axis}
                  tick={{ fill: chart.muted, fontSize: 10 }}
                  axisLine={{ stroke: chart.axis }}
                />
                <YAxis
                  domain={[0, Math.max(liveCount.capacity, 1)]}
                  stroke={chart.axis}
                  tick={{ fill: chart.muted, fontSize: 10 }}
                  axisLine={{ stroke: chart.axis }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: chart.tooltipBg,
                    borderColor: chart.tooltipBorder,
                    borderRadius: '12px',
                    color: chart.tooltipText,
                  }}
                  itemStyle={{ color: chart.tooltipText }}
                />
                <ReferenceLine
                  y={liveCount.capacity}
                  stroke="rgba(239,68,68,0.3)"
                  strokeDasharray="4 4"
                  label={{ value: 'Capacity', fill: 'rgba(239,68,68,0.5)', fontSize: 10, position: 'insideTopRight' }}
                />
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke={capacityColor}
                  strokeWidth={2}
                  fill="url(#trendGradient)"
                  dot={false}
                  activeDot={{ r: 4, fill: capacityColor, stroke: '#fff', strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </GlassPanel>
      </motion.div>

      {/* Hourly distribution from API */}
      <motion.div variants={itemVariants}>
        <GlassPanel className="p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-base font-semibold text-on-surface">Hourly Distribution</h3>
              <p className="text-xs text-on-surface-variant mt-0.5">
                Connections by hour — peak at {peakHourDisplay >= 0 ? `${peakHourDisplay}:00` : '—'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-[#8338EC]/20 rounded-lg">
                <BarChart3 className="w-3.5 h-3.5 text-[#8338EC]" />
              </div>
              <span className="text-xs text-on-surface-variant">Recent window (venue insights)</span>
            </div>
          </div>
          <div className="h-[200px] w-full min-w-0">
            <ResponsiveContainer width="100%" height={200} minWidth={0} minHeight={180}>
              <BarChart data={hourlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} vertical={false} />
                <XAxis
                  dataKey="hour"
                  stroke={chart.axis}
                  tick={{ fill: chart.muted, fontSize: 10 }}
                  interval={2}
                  axisLine={{ stroke: chart.axis }}
                />
                <YAxis
                  stroke={chart.axis}
                  tick={{ fill: chart.muted, fontSize: 10 }}
                  axisLine={{ stroke: chart.axis }}
                />
                <Tooltip
                  cursor={{ fill: chart.cursor }}
                  contentStyle={{
                    backgroundColor: chart.tooltipBg,
                    borderColor: chart.tooltipBorder,
                    borderRadius: '12px',
                    color: chart.tooltipText,
                  }}
                  itemStyle={{ color: chart.tooltipText }}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {hourlyData.map((_, idx) => (
                    <Cell
                      key={idx}
                      fill={idx === peakHourDisplay ? '#8338EC' : chart.barMuted}
                      style={idx === peakHourDisplay ? { filter: 'drop-shadow(0 0 8px rgba(131,56,236,0.5))' } : {}}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 text-center text-xs text-on-surface-variant">
            Busiest hour:{' '}
            <span className="text-[#8338EC] font-bold">{peakHourDisplay >= 0 ? `${peakHourDisplay}:00` : "—"}</span>
            {' '}— plan staff accordingly
          </div>
        </GlassPanel>
      </motion.div>
    </motion.div>
  );
}
