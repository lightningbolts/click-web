'use client';

import { useMemo } from 'react';
import { motion } from 'framer-motion';
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
import { CalendarDays, Bookmark, UserCheck, MapPin, Eye, Share2 } from 'lucide-react';
import useSWR from 'swr';
import { GlassPanel } from '@/components/insights/GlassPanel';
import { fetchInsightsApiJson } from '@/lib/insights/fetchInsightsApi';
import { useInsightsDemo } from '@/components/insights/InsightsDemoContext';
import { useAuth } from '@/lib/AuthContext';
import { mockEventEngagement } from '@/lib/insights/mockData';
import { useInsightsChartTheme } from '@/lib/theme/insightsChartTheme';
import { SectionHeader } from '@/components/ds/SectionHeader';

type EventEngagementResponse = typeof mockEventEngagement & {
  status?: string;
  error?: string;
};

const fetcher = (url: string) => fetchInsightsApiJson<EventEngagementResponse>(url);

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.08 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0 },
};

function pct(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return `${Math.round(v * 100)}%`;
}

export default function EventEngagementPage({ placeId }: { placeId: string }) {
  const chart = useInsightsChartTheme();
  const { user } = useAuth();
  const venueId = placeId;
  const url = `/api/insights/${placeId}/event-engagement`;
  const { data, error, isLoading } = useSWR<EventEngagementResponse>(
    user && url ? url : null,
    fetcher,
  );
  const { demoMode } = useInsightsDemo();

  const payload = useMemo(() => {
    if (demoMode && (!data || data.error || error)) return mockEventEngagement;
    if (data && !data.error) return data;
    if (demoMode) return mockEventEngagement;
    return null;
  }, [data, demoMode, error]);

  const funnelBars = payload
    ? [
        { name: 'Views', value: payload.funnel.impressions, color: chart.muted },
        { name: 'Bookmarks', value: payload.funnel.bookmarks, color: '#a78bfa' },
        { name: 'Shares', value: payload.funnel.shares ?? 0, color: '#f472b6' },
        { name: 'RSVPs', value: payload.funnel.rsvps, color: '#38bdf8' },
        { name: 'Check-ins', value: payload.funnel.check_ins, color: '#34d399' },
      ]
    : [];

  const arrivalData =
    payload?.arrival_histogram.map((b) => ({
      name: b.bucket.replace('_', '–'),
      count: b.count,
    })) ?? [];

  const rejectData = payload?.reject_reasons ?? [];

  return (
    <motion.div
      className="space-y-6 p-4 md:p-6"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      <motion.div variants={itemVariants}>
        <SectionHeader
          title="Event engagement"
          subtitle="From seeing an event to checking in, across this Place’s events. Counts only."
        />
      </motion.div>

      {!payload && isLoading && (
        <div className="h-40 animate-pulse rounded-2xl bg-surface-raised" />
      )}

      {!payload && !isLoading && (
        <GlassPanel className="p-6 text-fg-secondary">
          No event engagement yet. Host an event as this Place to see how people found it and showed up.
        </GlassPanel>
      )}

      {payload && (
        <>
          <motion.div
            variants={itemVariants}
            className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5"
          >
            <GlassPanel className="p-4">
              <div className="flex items-center gap-2 text-fg-secondary text-xs">
                <Eye className="h-3.5 w-3.5" /> Impressions
              </div>
              <div className="mt-1 text-2xl font-semibold text-fg">
                {payload.funnel.impressions}
              </div>
              <div className="text-xs text-fg/50">
                {payload.funnel.unique_viewers} unique viewers
              </div>
            </GlassPanel>
            <GlassPanel className="p-4">
              <div className="flex items-center gap-2 text-fg-secondary text-xs">
                <Bookmark className="h-3.5 w-3.5" /> Interest rate
              </div>
              <div className="mt-1 text-2xl font-semibold text-fg">
                {pct(payload.funnel.interest_rate)}
              </div>
              <div className="text-xs text-fg/50">
                {payload.funnel.bookmarks} bookmarks
              </div>
            </GlassPanel>
            <GlassPanel className="p-4">
              <div className="flex items-center gap-2 text-fg-secondary text-xs">
                <Share2 className="h-3.5 w-3.5" /> Share rate
              </div>
              <div className="mt-1 text-2xl font-semibold text-fg">
                {pct(payload.funnel.share_rate)}
              </div>
              <div className="text-xs text-fg/50">
                {payload.funnel.shares ?? 0} shares
              </div>
            </GlassPanel>
            <GlassPanel className="p-4">
              <div className="flex items-center gap-2 text-fg-secondary text-xs">
                <UserCheck className="h-3.5 w-3.5" /> RSVP conversion
              </div>
              <div className="mt-1 text-2xl font-semibold text-fg">
                {pct(payload.funnel.rsvp_conversion)}
              </div>
              <div className="text-xs text-fg/50">{payload.funnel.rsvps} RSVPs</div>
            </GlassPanel>
            <GlassPanel className="p-4">
              <div className="flex items-center gap-2 text-fg-secondary text-xs">
                <MapPin className="h-3.5 w-3.5" /> RSVP → check-in
              </div>
              <div className="mt-1 text-2xl font-semibold text-fg">
                {pct(payload.funnel.rsvp_to_check_in)}
              </div>
              <div className="text-xs text-fg/50">
                dwell p50 {payload.dwell.p50_minutes ?? '—'}m · p90{' '}
                {payload.dwell.p90_minutes ?? '—'}m
              </div>
            </GlassPanel>
          </motion.div>

          <motion.div variants={itemVariants} className="grid gap-4 lg:grid-cols-2">
            <GlassPanel className="p-4">
              <h2 className="mb-3 text-sm font-medium text-fg/80">Funnel</h2>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={funnelBars}>
                    <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} />
                    <XAxis
                      dataKey="name"
                      stroke={chart.axis}
                      tick={{ fill: chart.muted, fontSize: 12 }}
                    />
                    <YAxis stroke={chart.axis} tick={{ fill: chart.muted, fontSize: 12 }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: chart.tooltipBg,
                        borderColor: chart.tooltipBorder,
                        color: chart.tooltipText,
                      }}
                      itemStyle={{ color: chart.tooltipText }}
                    />
                    <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                      {funnelBars.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </GlassPanel>

            <GlassPanel className="p-4">
              <h2 className="mb-3 text-sm font-medium text-fg/80">
                Arrival vs event start (minutes)
              </h2>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={arrivalData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} />
                    <XAxis
                      dataKey="name"
                      stroke={chart.axis}
                      tick={{ fill: chart.muted, fontSize: 12 }}
                    />
                    <YAxis stroke={chart.axis} tick={{ fill: chart.muted, fontSize: 12 }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: chart.tooltipBg,
                        borderColor: chart.tooltipBorder,
                        color: chart.tooltipText,
                      }}
                      itemStyle={{ color: chart.tooltipText }}
                    />
                    <Bar dataKey="count" fill="#38bdf8" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </GlassPanel>
          </motion.div>

          <motion.div variants={itemVariants}>
            <GlassPanel className="p-4">
              <h2 className="mb-3 text-sm font-medium text-fg/80">
                Check-in rejects
              </h2>
              {rejectData.length === 0 ? (
                <p className="text-sm text-fg/50">No rejected check-ins yet.</p>
              ) : (
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={rejectData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} />
                      <XAxis
                        type="number"
                        stroke={chart.axis}
                        tick={{ fill: chart.muted, fontSize: 12 }}
                      />
                      <YAxis
                        type="category"
                        dataKey="reason"
                        width={120}
                        stroke={chart.axis}
                        tick={{ fill: chart.muted, fontSize: 12 }}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: chart.tooltipBg,
                          borderColor: chart.tooltipBorder,
                          color: chart.tooltipText,
                        }}
                        itemStyle={{ color: chart.tooltipText }}
                      />
                      <Bar dataKey="count" fill="#f97316" radius={[0, 6, 6, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </GlassPanel>
          </motion.div>
        </>
      )}
    </motion.div>
  );
}
