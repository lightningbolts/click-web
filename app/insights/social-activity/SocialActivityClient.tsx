'use client';

import { useMemo } from 'react';
import useSWR from 'swr';
import { motion } from 'framer-motion';
import {
  LineChart,
  Line,
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
import {
  Activity,
  TrendingUp,
  TrendingDown,
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Users,
  Zap,
} from 'lucide-react';
import { GlassPanel } from '@/components/insights/GlassPanel';
import { fetchInsightsApiJson } from '@/lib/insights/fetchInsightsApi';
import { useInsightsChartTheme } from '@/lib/theme/insightsChartTheme';

interface InsightsResponse {
  totalConnections: number;
  hourlyDistribution: number[];
  dailyData: { date: string; count: number }[];
  peakHour: number;
  retentionRate: string;
  busiestDay: string;
  status?: string;
}

const fetcher = (url: string) => fetchInsightsApiJson<InsightsResponse>(url);

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function parseDateLocal(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatDateLabel(iso: string) {
  const date = parseDateLocal(iso);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.08 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0 },
};

export default function SocialActivityPage() {
  const { data, isLoading } = useSWR<InsightsResponse>('/api/insights/venue', fetcher);
  const chart = useInsightsChartTheme();

  /** Sorted daily data (ascending) */
  const dailyData = useMemo(() => {
    if (!data?.dailyData) return [];
    return [...data.dailyData].sort((a, b) => a.date.localeCompare(b.date));
  }, [data]);

  /** Day-of-week distribution */
  const dowData = useMemo(() => {
    const counts = Array(7).fill(0);
    dailyData.forEach(({ date, count }) => {
      counts[parseDateLocal(date).getDay()] += count;
    });
    return DAYS.map((day, i) => ({ day, count: counts[i] }));
  }, [dailyData]);

  /** Week-over-week comparison */
  const { thisWeek, lastWeek } = useMemo(() => {
    const sorted = dailyData;
    const tw = sorted.slice(-7);
    const lw = sorted.slice(-14, -7);
    return {
      thisWeek: tw.reduce((s, x) => s + x.count, 0),
      lastWeek: lw.reduce((s, x) => s + x.count, 0),
    };
  }, [dailyData]);

  const wowChange = lastWeek > 0 ? ((thisWeek - lastWeek) / lastWeek) * 100 : 0;
  const avgPerDay = dailyData.length
    ? Math.round(dailyData.reduce((s, x) => s + x.count, 0) / dailyData.length)
    : 0;
  const peakDayCount = dailyData.length ? Math.max(...dailyData.map((d) => d.count)) : 0;

  // Skeleton
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="bg-surface-container rounded-2xl h-32 animate-pulse" />
          ))}
        </div>
        <div className="bg-surface-container rounded-2xl h-80 animate-pulse" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-surface-container rounded-2xl h-64 animate-pulse" />
          <div className="bg-surface-container rounded-2xl h-64 animate-pulse" />
        </div>
      </div>
    );
  }

  const TrendIcon = wowChange > 0 ? ArrowUpRight : wowChange < 0 ? ArrowDownRight : Minus;
  const trendColor = wowChange > 0 ? 'text-green-700 dark:text-green-400' : wowChange < 0 ? 'text-red-700 dark:text-red-400' : 'text-on-surface-variant';

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      {/* Page header */}
      <motion.div variants={itemVariants} className="flex items-center gap-3 mb-2">
        <div className="p-2.5 bg-[#8338EC]/20 rounded-xl border border-[#8338EC]/30">
          <Activity className="w-5 h-5 text-[#8338EC]" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-on-surface">Social Activity</h2>
          <p className="text-sm text-on-surface-variant">Detailed connection trends over the last 30 days</p>
        </div>
      </motion.div>

      {/* Stat cards */}
      <motion.div
        variants={itemVariants}
        className="grid grid-cols-2 lg:grid-cols-4 gap-4"
      >
        <GlassPanel className="p-5" glow="purple">
          <div className="flex items-center gap-2 mb-3">
            <Users className="w-4 h-4 text-[#8338EC]" />
            <span className="text-xs text-on-surface-variant">Total Connections</span>
          </div>
          <div className="text-3xl font-bold text-on-surface">
            {data?.totalConnections?.toLocaleString() ?? '—'}
          </div>
          <div className="text-xs text-on-surface-variant mt-1">Last 30 days</div>
        </GlassPanel>

        <GlassPanel className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <Calendar className="w-4 h-4 text-[#3A86FF]" />
            <span className="text-xs text-on-surface-variant">Avg / Day</span>
          </div>
          <div className="text-3xl font-bold text-on-surface">{avgPerDay}</div>
          <div className="text-xs text-on-surface-variant mt-1">connections per day</div>
        </GlassPanel>

        <GlassPanel className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <Zap className="w-4 h-4 text-amber-700 dark:text-amber-300" />
            <span className="text-xs text-on-surface-variant">Peak Day</span>
          </div>
          <div className="text-3xl font-bold text-on-surface">{peakDayCount}</div>
          <div className="text-xs text-on-surface-variant mt-1">{data?.busiestDay ?? '—'}</div>
        </GlassPanel>

        <GlassPanel className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <TrendIcon className={`w-4 h-4 ${trendColor}`} />
            <span className="text-xs text-on-surface-variant">Week vs Week</span>
          </div>
          <div className={`text-3xl font-bold ${trendColor}`}>
            {wowChange > 0 ? '+' : ''}{wowChange.toFixed(1)}%
          </div>
          <div className="text-xs text-on-surface-variant mt-1">
            {thisWeek} vs {lastWeek} last wk
          </div>
        </GlassPanel>
      </motion.div>

      {/* Main 30-day chart */}
      <motion.div variants={itemVariants}>
        <GlassPanel className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-base font-semibold text-on-surface">30-Day Connection Trend</h3>
              <p className="text-xs text-on-surface-variant mt-0.5">Daily connection count with 7-day moving context</p>
            </div>
            <span className="text-xs text-on-surface-variant bg-surface-container px-2.5 py-1 rounded-lg border border-border-hard">
              Last 30 days
            </span>
          </div>
          <div className="h-[320px] w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={280}>
              <AreaChart data={dailyData}>
                <defs>
                  <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8338EC" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#8338EC" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} vertical={false} />
                <XAxis
                  dataKey="date"
                  stroke={chart.axis}
                  tick={{ fill: chart.muted, fontSize: 11 }}
                  tickFormatter={formatDateLabel}
                  interval={5}
                  axisLine={{ stroke: chart.axis }}
                />
                <YAxis
                  stroke={chart.axis}
                  tick={{ fill: chart.muted, fontSize: 11 }}
                  axisLine={{ stroke: chart.axis }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: chart.tooltipBg,
                    borderColor: chart.tooltipBorder,
                    borderRadius: '12px',
                    color: chart.tooltipText,
                  }}
                  labelFormatter={(v) => formatDateLabel(v as string)}
                  itemStyle={{ color: chart.tooltipText }}
                  labelStyle={{ color: chart.tooltipLabel, fontSize: 12 }}
                />
                <ReferenceLine
                  y={avgPerDay}
                  stroke={chart.axis}
                  strokeDasharray="4 4"
                  label={{ value: `Avg: ${avgPerDay}`, fill: chart.muted, fontSize: 10, position: 'insideTopRight' }}
                />
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke="#8338EC"
                  strokeWidth={2}
                  fill="url(#areaGradient)"
                  dot={false}
                  activeDot={{ r: 5, fill: '#8338EC', stroke: '#fff', strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </GlassPanel>
      </motion.div>

      {/* Bottom row: day-of-week + week comparison */}
      <motion.div
        variants={itemVariants}
        className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6"
      >
        {/* Day-of-week distribution */}
        <GlassPanel className="p-6">
          <div className="mb-5">
            <h3 className="text-base font-semibold text-on-surface">Day-of-Week Pattern</h3>
            <p className="text-xs text-on-surface-variant mt-0.5">Which days drive the most connections</p>
          </div>
          <div className="h-[220px] w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={200}>
              <BarChart data={dowData} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} vertical={false} />
                <XAxis
                  dataKey="day"
                  stroke={chart.axis}
                  tick={{ fill: chart.muted, fontSize: 11 }}
                  axisLine={{ stroke: chart.axis }}
                />
                <YAxis
                  stroke={chart.axis}
                  tick={{ fill: chart.muted, fontSize: 11 }}
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
                <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                  {dowData.map((entry, i) => {
                    const max = Math.max(...dowData.map((d) => d.count));
                    const isTop = entry.count === max;
                    return (
                      <Cell
                        key={i}
                        fill={isTop ? '#8338EC' : chart.barMuted}
                        style={isTop ? { filter: 'drop-shadow(0 0 8px rgba(124,58,237,0.5))' } : {}}
                      />
                    );
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </GlassPanel>

        {/* Last 14 days: this-week vs last-week */}
        <GlassPanel className="p-6">
          <div className="mb-5">
            <h3 className="text-base font-semibold text-on-surface">Week-over-Week Comparison</h3>
            <p className="text-xs text-on-surface-variant mt-0.5">Last 7 days vs. previous 7 days</p>
          </div>
          <div className="h-[220px] w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={200}>
              <BarChart
                data={dailyData.slice(-7).map((d, i) => ({
                  day: DAYS[parseDateLocal(d.date).getDay()],
                  thisWeek: d.count,
                  lastWeek: dailyData[dailyData.length - 14 + i]?.count ?? 0,
                }))}
                barCategoryGap="25%"
                barGap={4}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} vertical={false} />
                <XAxis
                  dataKey="day"
                  stroke={chart.axis}
                  tick={{ fill: chart.muted, fontSize: 11 }}
                  axisLine={{ stroke: chart.axis }}
                />
                <YAxis
                  stroke={chart.axis}
                  tick={{ fill: chart.muted, fontSize: 11 }}
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
                <Bar dataKey="lastWeek" fill={chart.barMutedStrong} radius={[4, 4, 0, 0]} name="Last week" />
                <Bar dataKey="thisWeek" fill="#8338EC" radius={[4, 4, 0, 0]} name="This week"
                  style={{ filter: 'drop-shadow(0 0 6px rgba(124,58,237,0.4))' }}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center gap-4 mt-3 text-xs text-on-surface-variant">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-[#8338EC] inline-block" />
              This week ({thisWeek})
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-surface-container border border-border-hard inline-block" />
              Last week ({lastWeek})
            </span>
          </div>
        </GlassPanel>
      </motion.div>

      {/* Hourly distribution */}
      <motion.div variants={itemVariants}>
        <GlassPanel className="p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-base font-semibold text-on-surface">Hourly Activity Pattern</h3>
              <p className="text-xs text-on-surface-variant mt-0.5">Connections by hour of day (peak at {data?.peakHour ?? '—'}:00)</p>
            </div>
            <span className="text-xs px-2.5 py-1 rounded-lg bg-[#8338EC]/10 border border-[#8338EC]/20 text-[#8338EC]">
              {data?.peakHour ?? '—'}:00 peak
            </span>
          </div>
          <div className="h-[200px] w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={180}>
              <BarChart
                data={(data?.hourlyDistribution ?? []).map((count, hour) => ({ hour: `${hour}:00`, count, isHour: hour }))}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} vertical={false} />
                <XAxis
                  dataKey="hour"
                  stroke={chart.axis}
                  tick={{ fill: chart.muted, fontSize: 10 }}
                  interval={2}
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
                  {(data?.hourlyDistribution ?? []).map((_, hour) => (
                    <Cell
                      key={hour}
                      fill={hour === data?.peakHour ? '#8338EC' : chart.barMuted}
                      style={hour === data?.peakHour ? { filter: 'drop-shadow(0 0 8px rgba(124,58,237,0.5))' } : {}}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </GlassPanel>
      </motion.div>
    </motion.div>
  );
}
