'use client';

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import { MapPin, Flame, TrendingUp, BarChart2 } from 'lucide-react';
import { GlassPanel } from '@/components/insights/GlassPanel';
import HeatmapView from '@/components/insights/HeatmapView';
import InsightsMap from '@/components/insights/InsightsMap';
import { mockVenueInsights, type HeatmapZone } from '@/lib/insights/mockData';
import type { VerifiedConnectionMapNode } from '@/lib/insights/connectionEncounterClustering';
import { DemoBanner } from '@/components/insights/DemoBanner';
import { useInsightsDemo } from '@/components/insights/InsightsDemoContext';
import { useAuth } from '@/lib/AuthContext';
import { fetchInsightsApiJson } from '@/lib/insights/fetchInsightsApi';
import { useInsightsChartTheme } from '@/lib/theme/insightsChartTheme';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';

interface InsightsHeatmapPayload {
  heatmapZones?: unknown[];
  verifiedConnectionNodes?: VerifiedConnectionMapNode[];
  venueLatitude?: number | null;
  venueLongitude?: number | null;
  status?: string;
}

const insightsFetcher = (url: string) =>
  fetchInsightsApiJson<InsightsHeatmapPayload>(url);

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.08 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0 },
};

const TYPE_COLORS: Record<string, string> = {
  bar: '#8338EC',
  dance: '#FF3864',
  lounge: '#3A86FF',
  stage: '#FFD93D',
  entrance: '#9ca3af',
  vip: '#FF6B6B',
};

function IntensityBadge({ intensity }: { intensity: number }) {
  const pct = Math.round(intensity * 100);
  const color =
    pct >= 80
      ? 'text-red-700 dark:text-red-400 bg-red-500/10 border-red-500/20'
      : pct >= 50
      ? 'text-amber-700 dark:text-amber-300 bg-amber-500/10 border-amber-500/20'
      : 'text-blue-400 bg-blue-500/10 border-blue-500/20';
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full border ${color}`}>
      {pct}% heat
    </span>
  );
}

export default function HeatmapPage() {
  const chart = useInsightsChartTheme();
  const { demoMode } = useInsightsDemo();
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const venueId = searchParams.get('venue_id') ?? undefined;
  const insightsUrl = user
    ? venueId
      ? `/api/insights/${venueId}`
      : '/api/insights/venue'
    : null;
  const { data: apiPayload } = useSWR(insightsUrl, insightsFetcher);

  const verifiedNodes: VerifiedConnectionMapNode[] = useMemo(() => {
    const raw = apiPayload?.verifiedConnectionNodes;
    if (!Array.isArray(raw)) return [];
    return raw.filter(
      (n): n is VerifiedConnectionMapNode =>
        n != null &&
        typeof n === 'object' &&
        typeof (n as VerifiedConnectionMapNode).connectionId === 'string' &&
        typeof (n as VerifiedConnectionMapNode).latitude === 'number' &&
        typeof (n as VerifiedConnectionMapNode).longitude === 'number',
    );
  }, [apiPayload?.verifiedConnectionNodes]);

  const venueCenter = useMemo(
    () => ({
      lat: typeof apiPayload?.venueLatitude === 'number' ? apiPayload.venueLatitude : null,
      lng: typeof apiPayload?.venueLongitude === 'number' ? apiPayload.venueLongitude : null,
    }),
    [apiPayload?.venueLatitude, apiPayload?.venueLongitude],
  );

  const zones: HeatmapZone[] = useMemo(() => {
    if (demoMode) return mockVenueInsights.heatmapZones;
    const raw = apiPayload?.heatmapZones;
    if (Array.isArray(raw) && raw.length > 0) return raw as HeatmapZone[];
    return [];
  }, [demoMode, apiPayload?.heatmapZones]);
  const sorted = [...zones].sort((a, b) => b.connections - a.connections);
  const totalConnections = zones.reduce((s, z) => s + z.connections, 0);
  const maxZoneConnections = sorted[0]?.connections ?? 1;

  // Type distribution chart data
  const typeDist = Object.entries(
    zones.reduce((acc, z) => {
      acc[z.type] = (acc[z.type] ?? 0) + z.connections;
      return acc;
    }, {} as Record<string, number>)
  ).map(([type, count]) => ({ type, count }));

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      {demoMode ? (
        <motion.div variants={itemVariants}>
          <DemoBanner />
        </motion.div>
      ) : null}
      {/* Header */}
      <motion.div variants={itemVariants} className="flex items-center gap-3 mb-2">
        <div className="p-2.5 bg-[#FF6B6B]/20 rounded-xl border border-[#FF6B6B]/30">
          <MapPin className="w-5 h-5 text-[#FF6B6B]" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-on-surface">Spatial Heatmap</h2>
          <p className="text-sm text-on-surface-variant">Zone-by-zone connection density across your venue</p>
        </div>
      </motion.div>

      {/* Summary stat cards */}
      <motion.div variants={itemVariants} className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <GlassPanel className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <Flame className="w-4 h-4 text-red-700 dark:text-red-400" />
            <span className="text-xs text-on-surface-variant">Hottest Zone</span>
          </div>
          <div className="text-2xl font-bold text-on-surface">
            {sorted[0]?.name ?? '—'}
          </div>
          <div className="text-xs text-on-surface-variant mt-1">{sorted[0]?.connections} connections</div>
        </GlassPanel>

        <GlassPanel className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <BarChart2 className="w-4 h-4 text-[#8338EC]" />
            <span className="text-xs text-on-surface-variant">Total Connections</span>
          </div>
          <div className="text-2xl font-bold text-on-surface">{totalConnections}</div>
          <div className="text-xs text-on-surface-variant mt-1">across all zones</div>
        </GlassPanel>

        <GlassPanel className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <MapPin className="w-4 h-4 text-[#3A86FF]" />
            <span className="text-xs text-on-surface-variant">Active Zones</span>
          </div>
          <div className="text-2xl font-bold text-on-surface">{zones.length}</div>
          <div className="text-xs text-on-surface-variant mt-1">tracked areas</div>
        </GlassPanel>

        <GlassPanel className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4 text-green-700 dark:text-green-400" />
            <span className="text-xs text-on-surface-variant">Avg / Zone</span>
          </div>
          <div className="text-2xl font-bold text-on-surface">
            {zones.length ? Math.round(totalConnections / zones.length) : 0}
          </div>
          <div className="text-xs text-on-surface-variant mt-1">connections avg</div>
        </GlassPanel>
      </motion.div>

      {/* Large heatmap */}
      <motion.div variants={itemVariants}>
        <HeatmapView zones={zones} />
      </motion.div>

      {/* Verified connection map — client-side centroid clustering of raw encounter GPS */}
      <motion.div variants={itemVariants}>
        <GlassPanel className="p-6">
          <div className="mb-4">
            <h3 className="text-base font-semibold text-on-surface">Verified Connection Map</h3>
            <p className="text-xs text-on-surface-variant mt-0.5">
              Raw GPS is stored per participant; multi-user handshakes snap to a centroid here only.
            </p>
          </div>
          <InsightsMap nodes={verifiedNodes} venueCenter={venueCenter} />
        </GlassPanel>
      </motion.div>

      {/* Zone table + type distribution */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        {/* Zone ranking table */}
        <GlassPanel className="p-6">
          <h3 className="text-base font-semibold text-on-surface mb-4">Zone Rankings</h3>
          <div className="space-y-3">
            {sorted.length === 0 ? (
              <p className="text-sm text-on-surface-variant py-6 text-center">
                Zone-level heatmap data will appear when your venue has mapped check-ins.
              </p>
            ) : null}
            {sorted.map((zone, i) => (
              <div key={zone.id} className="flex items-center gap-3">
                <span className="text-xs font-bold text-on-surface-variant w-5">{i + 1}</span>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-on-surface font-medium">{zone.name}</span>
                    <div className="flex items-center gap-2">
                      <IntensityBadge intensity={zone.intensity} />
                      <span className="text-xs text-on-surface-variant">{zone.connections}</span>
                    </div>
                  </div>
                  <div className="h-1.5 bg-surface-container rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${(zone.connections / maxZoneConnections) * 100}%` }}
                      transition={{ duration: 0.8, delay: i * 0.06, ease: 'easeOut' }}
                      className="h-full rounded-full"
                      style={{ backgroundColor: TYPE_COLORS[zone.type] ?? '#8338EC' }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </GlassPanel>

        {/* Type distribution chart */}
        <GlassPanel className="p-6">
          <div className="mb-5">
            <h3 className="text-base font-semibold text-on-surface">Connections by Zone Type</h3>
            <p className="text-xs text-on-surface-variant mt-0.5">Total connections grouped by venue area type</p>
          </div>
          <div className="h-[240px] w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={200}>
              <BarChart data={typeDist} layout="vertical" barCategoryGap="25%">
                <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} horizontal={false} />
                <XAxis
                  type="number"
                  stroke={chart.axis}
                  tick={{ fill: chart.muted, fontSize: 10 }}
                  axisLine={{ stroke: chart.axis }}
                />
                <YAxis
                  type="category"
                  dataKey="type"
                  stroke={chart.axis}
                  tick={{ fill: chart.muted, fontSize: 11 }}
                  axisLine={{ stroke: chart.axis }}
                  width={60}
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
                  {typeDist.map((entry) => (
                    <Cell key={entry.type} fill={TYPE_COLORS[entry.type] ?? '#8338EC'} />
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
