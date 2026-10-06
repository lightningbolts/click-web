'use client';

import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Users2, Link2, TrendingUp, Info } from 'lucide-react';
import { GlassPanel } from '@/components/insights/GlassPanel';
import TribeChart from '@/components/insights/TribeChart';
import { mockVenueInsights, type TribeBubble } from '@/lib/insights/mockData';
import { useInsightsDemo } from '@/components/insights/InsightsDemoContext';
import { useAuth } from '@/lib/AuthContext';
import { fetchInsightsApiJson } from '@/lib/insights/fetchInsightsApi';
import useSWR from 'swr';
import {
  microCommunitiesToTribeBubbles,
  type VenueMicroCommunity,
} from '@/lib/insights/microCommunities';
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from 'recharts';
import { useInsightsChartTheme } from '@/lib/theme/insightsChartTheme';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.08 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0 },
};

interface InsightsTribesPayload {
  microCommunities?: unknown;
  status?: string;
}

const tribesFetcher = (url: string) => fetchInsightsApiJson<InsightsTribesPayload>(url);

export default function TribesPage({ placeId }: { placeId: string }) {
  const chart = useInsightsChartTheme();
  const { demoMode } = useInsightsDemo();
  const { user } = useAuth();
  const venueId = placeId;
  const insightsUrl = `/api/insights/${placeId}`;
  const { data: apiPayload } = useSWR(user && insightsUrl ? insightsUrl : null, tribesFetcher);

  const tribes: TribeBubble[] = useMemo(() => {
    if (demoMode) return mockVenueInsights.tribes;
    const raw = apiPayload?.microCommunities;
    if (Array.isArray(raw) && raw.length > 0) {
      return microCommunitiesToTribeBubbles(raw as VenueMicroCommunity[]);
    }
    return [];
  }, [apiPayload?.microCommunities, demoMode]);

  const [selected, setSelected] = useState<TribeBubble | null>(null);

  const sorted = [...tribes].sort((a, b) => b.connections - a.connections);
  const totalConnections = tribes.reduce((s, t) => s + t.connections, 0);
  const avgConnections =
    tribes.length > 0 ? Math.round(totalConnections / tribes.length) : 0;
  const mostOverlapping =
    tribes.length > 0 && !tribes.some((t) => t.isMicroCommunity)
      ? tribes.reduce((max, t) =>
          (t.overlap?.length ?? 0) > (max.overlap?.length ?? 0) ? t : max,
        tribes[0],
      )
      : null;

  // Connections bar data (top 6)
  const barData = sorted.slice(0, 6).map((t) => ({
    name: t.name,
    count: t.connections,
    color: t.color,
  }));

  const maxTribeSize = tribes.length ? Math.max(...tribes.map((x) => x.size), 1) : 1;
  const maxTribeConnections = tribes.length
    ? Math.max(...tribes.map((x) => x.connections), 1)
    : 1;

  // Radar chart: each tribe's relative size vs connections
  const radarData = sorted.slice(0, 6).map((t) => ({
    subject: t.name,
    members: Math.round((t.size / maxTribeSize) * 100),
    connections: Math.round((t.connections / maxTribeConnections) * 100),
  }));

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      {/* Header */}
      <motion.div variants={itemVariants} className="flex items-center gap-3 mb-2">
        <div className="p-2.5 bg-[#C77DFF]/20 rounded-xl border border-[#C77DFF]/30">
          <Users2 className="w-5 h-5 text-[#C77DFF]" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-fg">Tribe Analysis</h2>
          <p className="text-sm text-fg-secondary">Interest clustering and community overlap at your Place</p>
        </div>
      </motion.div>

      {/* Stat cards */}
      <motion.div variants={itemVariants} className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <GlassPanel className="p-5" glow="purple">
          <div className="flex items-center gap-2 mb-3">
            <Users2 className="w-4 h-4 text-[#C77DFF]" />
            <span className="text-xs text-fg-secondary">Total Tribes</span>
          </div>
          <div className="text-3xl font-bold text-fg">{tribes.length}</div>
          <div className="text-xs text-fg-secondary mt-1">distinct communities</div>
        </GlassPanel>

        <GlassPanel className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <Link2 className="w-4 h-4 text-[#3A86FF]" />
            <span className="text-xs text-fg-secondary">Total Connections</span>
          </div>
          <div className="text-3xl font-bold text-fg">{totalConnections.toLocaleString()}</div>
          <div className="text-xs text-fg-secondary mt-1">cross-tribe networking</div>
        </GlassPanel>

        <GlassPanel className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4 text-green-700 dark:text-green-400" />
            <span className="text-xs text-fg-secondary">Avg / Tribe</span>
          </div>
          <div className="text-3xl font-bold text-fg">{avgConnections}</div>
          <div className="text-xs text-fg-secondary mt-1">connections per group</div>
        </GlassPanel>

        <GlassPanel className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <Info className="w-4 h-4 text-amber-700 dark:text-amber-300" />
            <span className="text-xs text-fg-secondary">Most Overlap</span>
          </div>
          <div className="text-xl font-bold text-fg">{mostOverlapping?.name ?? '—'}</div>
          <div className="text-xs text-fg-secondary mt-1">
            {mostOverlapping?.overlap?.length ?? 0} tribe connections
          </div>
        </GlassPanel>
      </motion.div>

      {/* Full tribe chart */}
      <motion.div variants={itemVariants}>
        {tribes.length === 0 ? (
          <GlassPanel className="p-8 text-center text-sm text-fg-secondary">
            {demoMode
              ? 'Not enough people have checked in here yet to show groups. Every chart waits for real data.'
              : 'Tribe clustering and verified micro-communities appear when guests with shared interests check in at your venue.'}
          </GlassPanel>
        ) : (
          <TribeChart tribes={tribes} />
        )}
      </motion.div>

      {/* Bottom row */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        {/* Tribe leaderboard */}
        <GlassPanel className="p-6">
          <h3 className="text-base font-semibold text-fg mb-4">Tribe Leaderboard</h3>
          <div className="space-y-3">
            {sorted.map((tribe, i) => (
              <motion.div
                key={tribe.id}
                whileHover={{ x: 2 }}
                onClick={() => setSelected(selected?.id === tribe.id ? null : tribe)}
                className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors ${
                  selected?.id === tribe.id
                    ? 'bg-surface-raised border border-hairline'
                    : 'hover:bg-surface-raised'
                }`}
              >
                <span className="text-xs font-bold text-fg-secondary w-4">{i + 1}</span>
                <div
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: tribe.color }}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-fg font-medium truncate">{tribe.name}</span>
                    <span className="text-xs text-fg-secondary ml-2 flex-shrink-0">
                      {tribe.connections} connections
                    </span>
                  </div>
                  {selected?.id === tribe.id && tribe.overlap && !tribe.isMicroCommunity && (
                    <p className="text-[10px] text-fg-secondary mt-1">
                      Overlaps with: {tribe.overlap.join(', ')}
                    </p>
                  )}
                  {selected?.id === tribe.id && tribe.isMicroCommunity && tribe.interestTags && tribe.interestTags.length > 0 && (
                    <p className="text-[10px] text-emerald-700 dark:text-emerald-200/90 mt-1">
                      Top tags: {tribe.interestTags.slice(0, 6).map((t) => t.tag).join(', ')}
                    </p>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        </GlassPanel>

        {/* Connection count bar chart */}
        <GlassPanel className="p-6">
          <div className="mb-5">
            <h3 className="text-base font-semibold text-fg">Top Tribes by Connections</h3>
            <p className="text-xs text-fg-secondary mt-0.5">Connections formed within each community</p>
          </div>
          <div className="h-[280px] w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={240}>
              <BarChart data={barData} layout="vertical" barCategoryGap="20%">
                <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} horizontal={false} />
                <XAxis
                  type="number"
                  stroke={chart.axis}
                  tick={{ fill: chart.muted, fontSize: 10 }}
                  axisLine={{ stroke: chart.axis }}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  stroke={chart.axis}
                  tick={{ fill: chart.muted, fontSize: 11 }}
                  axisLine={{ stroke: chart.axis }}
                  width={80}
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
                <Bar dataKey="count" radius={[0, 6, 6, 0]}>
                  {barData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
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
