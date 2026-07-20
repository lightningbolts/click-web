"use client";

import { useEffect, useMemo } from "react";
import { useAuth } from "@/lib/AuthContext";
import { useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import { motion } from "framer-motion";
import { useInsightsChartTheme } from "@/lib/theme/insightsChartTheme";
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
  Cell,
} from "recharts";
import {
  Users,
  Calendar,
  TrendingUp,
  Clock,
  AlertCircle,
  BarChart3,
  Activity,
} from "lucide-react";

// Import Click Insights Dashboard Components
import {
  StickyScoreCard,
  ConnectionDensityCard,
  LiveCountCard,
} from "./StickyScoreCard";
import HeatmapView from "./HeatmapView";
import TribeChart from "./TribeChart";
import VibeStream from "./VibeStream";

import {
  emptyStickyScore,
  emptyConnectionDensity,
  emptyLiveCount,
  mockVenueInsights,
  mockAdvancedMetrics,
  mockInsightsDailyData,
  mockInsightsHourlyDistribution,
  mockInsightsPeakHour,
} from "@/lib/insights/mockData";
import { DemoBanner } from "./DemoBanner";
import { useInsightsDemo } from "./InsightsDemoContext";
import { fetchInsightsApiJson } from "@/lib/insights/fetchInsightsApi";
import type { VibeMessage, TribeBubble, HeatmapZone } from "@/lib/insights/mockData";
import {
  microCommunitiesToTribeBubbles,
  type VenueMicroCommunity,
} from "@/lib/insights/microCommunities";
import AdvancedMetricsGrid from "./AdvancedMetricsGrid";
import EnvironmentalMetrics from "./EnvironmentalMetrics";
import { GlassPanel } from "./GlassPanel";

interface InsightsResponse {
  totalConnections: number;
  hourlyDistribution: number[];
  dailyData: { date: string; count: number }[];
  peakHour: number;
  retentionRate: string;
  busiestDay: string;
  status?: string;
  message?: string;
  microCommunities?: unknown;
  venueName?: string;
  heatmapZones?: any[];
  vibeMessages?: any[];
  liveCount?: any;
  connectionDensity?: any;
  stickyScore?: any;
}

const fetcher = (url: string) => fetchInsightsApiJson<InsightsResponse>(url);

/**
 * InsightsSkeleton - Bento-grid loading skeleton with rounded corners
 */
function InsightsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
        {[0, 1, 2].map((i) => (
          <div key={i} className="bg-surface-container rounded-2xl h-52 animate-pulse" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        {[0, 1].map((i) => (
          <div
            key={i}
            className="bg-surface-container rounded-2xl h-[380px] animate-pulse"
          />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        <div className="bg-surface-container rounded-2xl h-80 lg:col-span-2 animate-pulse" />
        <div className="bg-surface-container rounded-2xl h-80 animate-pulse" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="bg-surface-container rounded-2xl h-36 animate-pulse" />
        ))}
      </div>
      <div className="bg-surface-container rounded-2xl h-52 animate-pulse" />
    </div>
  );
}

/**
 * InsightsDashboard - The main content component for the Insights page
 * Contains all the bento box cards and charts
 */
function InsightsDashboardContent({ venueId: venueIdProp }: { venueId?: string }) {
  const { user, loading: authLoading } = useAuth();
  const chart = useInsightsChartTheme();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { demoMode } = useInsightsDemo();
  const venueIdFromQuery = searchParams.get("venue_id") ?? undefined;
  const venueId = venueIdProp ?? venueIdFromQuery ?? undefined;

  const chartMuted = chart.muted;
  const chartAxis = chart.axis;
  const chartGrid = chart.grid;
  const chartTooltipBg = chart.tooltipBg;
  const chartTooltipBorder = chart.tooltipBorder;
  const chartTooltipText = chart.tooltipText;
  const chartTooltipLabel = chart.tooltipLabel;
  const chartCursor = chart.cursor;
  const chartDotStroke = chart.tooltipBg;

  const insightsUrl = venueId ? `/api/insights/${venueId}` : "/api/insights/venue";
  const { data: apiData, error, isLoading } = useSWR<InsightsResponse>(
    user ? insightsUrl : null,
    fetcher,
  );

  const data = apiData;

  const isDemoFallback =
    demoMode &&
    !!data &&
    (data.status === "no_venue" || data.status === "insufficient_data");

  const displayInsights: InsightsResponse | undefined =
    isDemoFallback && data
      ? {
          ...data,
          totalConnections: mockInsightsDailyData.reduce((s, x) => s + x.count, 0),
          hourlyDistribution: mockInsightsHourlyDistribution,
          dailyData: mockInsightsDailyData,
          peakHour: mockInsightsPeakHour,
          retentionRate: "42%",
          busiestDay: "Saturday",
        }
      : data;

  const stickyForView = isDemoFallback
    ? mockVenueInsights.stickyScore
    : (data?.stickyScore ?? emptyStickyScore);
  const densityForView = isDemoFallback
    ? mockVenueInsights.connectionDensity
    : (data?.connectionDensity ?? emptyConnectionDensity);
  const liveForView = isDemoFallback
    ? mockVenueInsights.liveCount
    : (data?.liveCount ?? emptyLiveCount);

  const vibeMessagesForStream: VibeMessage[] = useMemo(() => {
    if (isDemoFallback) return mockVenueInsights.vibeStream;
    const raw = data?.vibeMessages;
    if (!Array.isArray(raw)) return [];
    return raw.map((m: any, i: number) => ({
      id: typeof m?.id === "string" ? m.id : `vibe-${i}`,
      message: typeof m?.message === "string" ? m.message : "",
      sentiment: (m?.sentiment ?? "neutral") as VibeMessage["sentiment"],
      category: (m?.category ?? "general") as VibeMessage["category"],
      timestamp:
        m?.timestamp instanceof Date
          ? m.timestamp
          : new Date(
              typeof m?.timestamp === "string" || typeof m?.timestamp === "number"
                ? m.timestamp
                : Date.now(),
            ),
      icon: m?.icon,
    }));
  }, [data?.vibeMessages, isDemoFallback]);

  const advancedVenueId = venueId ?? (isDemoFallback ? "demo" : undefined);

  const tribeChartTribes: TribeBubble[] = useMemo(() => {
    if (isDemoFallback) return mockVenueInsights.tribes;
    const raw = data?.microCommunities;
    if (Array.isArray(raw) && raw.length > 0) {
      return microCommunitiesToTribeBubbles(raw as VenueMicroCommunity[]);
    }
    return [];
  }, [data?.microCommunities, isDemoFallback]);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/");
    }
  }, [user, authLoading, router]);

  if (authLoading || !user || (isLoading && !error)) {
    return <InsightsSkeleton />;
  }

  if (error) {
    if (error.status === 403) {
      return (
        <div className="flex items-center justify-center p-4 min-h-[400px]">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="fc-card max-w-md border-2 border-border-hard p-8 text-center" style={{ backgroundColor: "var(--color-surface)" }}
          >
            <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-on-surface mb-2">
              Access Denied
            </h1>
            <p className="text-on-surface-variant mb-6">
              This dashboard is only available to verified business partners.
            </p>
            <button
              onClick={() => router.push("/")}
              className="bg-primary hover:brightness-90 text-on-primary px-6 py-3 rounded-xl transition-colors"
            >
              Go to your dashboard
            </button>
          </motion.div>
        </div>
      );
    }

    return (
      <div className="flex items-center justify-center p-4 min-h-[400px]">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="fc-card max-w-md border-2 border-border-hard p-8 text-center" style={{ backgroundColor: "var(--color-surface)" }}
        >
          <AlertCircle className="w-16 h-16 text-amber-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-on-surface mb-2">
            Could not load insights
          </h1>
          <p className="text-on-surface-variant mb-6">
            Something went wrong. Please refresh or try again later.
          </p>
          <button
            type="button"
            onClick={() => router.refresh()}
            className="bg-primary hover:brightness-90 text-on-primary px-6 py-3 rounded-xl transition-colors"
          >
            Retry
          </button>
        </motion.div>
      </div>
    );
  }

  if (data?.status === "insufficient_data" && !isDemoFallback) {
    return (
      <div className="flex items-center justify-center p-4 min-h-[400px]">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="fc-card max-w-md border-2 border-border-hard p-8 text-center" style={{ backgroundColor: "var(--color-surface)" }}
        >
          <Users className="w-16 h-16 text-outline mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-on-surface mb-2">
            Insufficient Data
          </h1>
          <p className="text-on-surface-variant mb-6">
            {data.message ||
              "We need at least 5 connections to generate insights to protect user privacy."}
          </p>
          <button
            onClick={() => router.push("/")}
            className="bg-primary hover:brightness-90 text-on-primary px-6 py-3 rounded-xl transition-colors"
          >
            Back to your dashboard
          </button>
        </motion.div>
      </div>
    );
  }

  // Prepare data for charts
  const hourlyData =
    displayInsights?.hourlyDistribution?.map((count: number, hour: number) => ({
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
      {isDemoFallback ? (
        <motion.div variants={itemVariants}>
          <DemoBanner />
        </motion.div>
      ) : data?.status === "no_venue" && data.message ? (
        <motion.div
          variants={itemVariants}
          className="rounded-2xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-100"
        >
          {data.message}
        </motion.div>
      ) : null}

      {/* TOP ROW: Metric Cards */}
      <motion.div
        variants={itemVariants}
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6"
      >
        <StickyScoreCard data={stickyForView} />
        <ConnectionDensityCard data={densityForView} />
        <LiveCountCard data={liveForView} />
      </motion.div>

      {/* Advanced Social ROI (RPC-backed) */}
      <motion.div variants={itemVariants}>
        <AdvancedMetricsGrid
          venueId={advancedVenueId}
          staticData={isDemoFallback ? mockAdvancedMetrics : undefined}
        />
      </motion.div>

      {/* Environment & flow (WRI, PSV, GCR) */}
      <motion.div variants={itemVariants}>
        <EnvironmentalMetrics
          venueId={advancedVenueId}
          staticData={isDemoFallback ? mockAdvancedMetrics : undefined}
        />
      </motion.div>

      {/* SECOND ROW: Heatmap + Tribe Analysis */}
      <motion.div
        variants={itemVariants}
        className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6"
      >
        <HeatmapView
          zones={
            (isDemoFallback
              ? mockVenueInsights.heatmapZones
              : (data?.heatmapZones ?? [])) as HeatmapZone[]
          }
        />
        <TribeChart tribes={tribeChartTribes} />
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
              <div className="p-2 bg-[#630ed4]/20 rounded-lg">
                <Activity className="w-4 h-4 text-[#630ed4]" />
              </div>
              <span className="text-sm font-medium text-on-surface-variant">
                Social Activity
              </span>
            </div>
            <span className="text-xs text-on-surface-variant">Last 30 days</span>
          </div>
          <div className="w-full min-w-0 overflow-hidden">
            <ResponsiveContainer
              width="100%"
              height={280}
              minWidth={0}
              minHeight={200}
            >
              <LineChart data={displayInsights?.dailyData || []}>
                <defs>
                  <linearGradient
                    id="colorGradient"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="5%" stopColor="#630ed4" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#630ed4" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke={chartGrid}
                  vertical={false}
                />
                <XAxis
                  dataKey="date"
                  stroke={chartAxis}
                  tick={{ fill: chartMuted, fontSize: 11 }}
                  tickFormatter={(value) => {
                    try {
                      const [y, m, d] = (value as string)
                        .split("-")
                        .map(Number);
                      return new Date(y, m - 1, d).toLocaleDateString(
                        undefined,
                        { month: "short", day: "numeric" },
                      );
                    } catch {
                      return value;
                    }
                  }}
                  interval={5}
                  axisLine={{ stroke: chartGrid }}
                />
                <YAxis
                  stroke={chartAxis}
                  tick={{ fill: chartMuted, fontSize: 11 }}
                  axisLine={{ stroke: chartGrid }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: chartTooltipBg,
                    borderColor: chartTooltipBorder,
                    borderRadius: "12px",
                    boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
                  }}
                  itemStyle={{ color: chartTooltipText }}
                  labelStyle={{ color: chartTooltipLabel }}
                />
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke="#630ed4"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{
                    r: 6,
                    fill: "#630ed4",
                    stroke: chartDotStroke,
                    strokeWidth: 2,
                    style: {
                      filter: "drop-shadow(0 0 8px rgba(131, 56, 236, 0.8))",
                    },
                  }}
                  style={{
                    filter: "drop-shadow(0 0 8px rgba(131, 56, 236, 0.5))",
                  }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </GlassPanel>

        {/* Vibe Stream */}
        <VibeStream messages={vibeMessagesForStream} />
      </motion.div>

      {/* FOURTH ROW: Additional Analytics */}
      <motion.div
        variants={itemVariants}
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6"
      >
        <GlassPanel className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-[#630ed4]/20 rounded-lg">
              <Users className="w-4 h-4 text-[#630ed4]" />
            </div>
            <span className="text-sm font-medium text-on-surface-variant">
              Total Connections
            </span>
          </div>
          <div className="text-3xl font-bold text-on-surface">
            {displayInsights?.totalConnections || 0}
          </div>
          <div className="text-xs text-on-surface-variant mt-2">Last 30 days</div>
        </GlassPanel>

        <GlassPanel className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-green-500/20 rounded-lg">
              <TrendingUp className="w-4 h-4 text-green-500" />
            </div>
            <span className="text-sm font-medium text-on-surface-variant">
              Retention Rate
            </span>
          </div>
          <div className="text-3xl font-bold text-on-surface">
            {displayInsights?.retentionRate || "N/A"}
          </div>
          <div className="text-xs text-on-surface-variant mt-2">Returning visitors</div>
        </GlassPanel>

        <GlassPanel className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-orange-500/20 rounded-lg">
              <Calendar className="w-4 h-4 text-orange-500" />
            </div>
            <span className="text-sm font-medium text-on-surface-variant">
              Busiest Day
            </span>
          </div>
          <div className="text-2xl font-bold text-on-surface">
            {displayInsights?.busiestDay || "N/A"}
          </div>
          <div className="text-xs text-on-surface-variant mt-2">Highest activity</div>
        </GlassPanel>

        <GlassPanel className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-[#630ed4]/20 rounded-lg">
              <Clock className="w-4 h-4 text-[#630ed4]" />
            </div>
            <span className="text-sm font-medium text-on-surface-variant">Peak Hour</span>
          </div>
          <div className="text-3xl font-bold text-on-surface">
            {displayInsights?.peakHour ?? "N/A"}:00
          </div>
          <div className="text-xs text-on-surface-variant mt-2">Most active time</div>
        </GlassPanel>
      </motion.div>

      {/* FIFTH ROW: Popular Times Chart */}
      <motion.div variants={itemVariants}>
        <GlassPanel className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-[#630ed4]/20 rounded-lg">
                <BarChart3 className="w-4 h-4 text-[#630ed4]" />
              </div>
              <span className="text-sm font-medium text-on-surface-variant">
                Popular Times
              </span>
            </div>
            <span className="text-xs text-on-surface-variant">Hourly distribution</span>
          </div>
          <div className="w-full min-w-0 overflow-hidden">
            <ResponsiveContainer
              width="100%"
              height={200}
              minWidth={0}
              minHeight={150}
            >
              <BarChart data={hourlyData}>
                <XAxis
                  dataKey="hour"
                  stroke={chartAxis}
                  tick={{ fill: chartMuted, fontSize: 10 }}
                  interval={2}
                  axisLine={{ stroke: chartGrid }}
                />
                <Tooltip
                  cursor={{ fill: chartCursor }}
                  contentStyle={{
                    backgroundColor: chartTooltipBg,
                    borderColor: chartTooltipBorder,
                    borderRadius: "12px",
                  }}
                  itemStyle={{ color: chartTooltipText }}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {hourlyData.map((entry: any, index: number) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={
                        index === displayInsights?.peakHour
                          ? "#630ed4"
                          : chart.barMuted
                      }
                      style={
                        index === displayInsights?.peakHour
                          ? {
                            filter:
                              "drop-shadow(0 0 8px rgba(131, 56, 236, 0.5))",
                          }
                          : {}
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 text-center text-xs text-on-surface-variant">
            Peak activity is around{" "}
            <span className="text-[#630ed4] font-bold">
              {displayInsights?.peakHour}:00
            </span>
          </div>
        </GlassPanel>
      </motion.div>
    </motion.div>
  );
}

/**
 * InsightsDashboard - Renders the overview bento-grid content.
 * The layout shell is provided by app/insights/layout.tsx (BusinessInsightsShell).
 * Pass venueId to fetch real data from the API.
 */
export default function InsightsDashboard({ venueId }: { venueId?: string }) {
  return <InsightsDashboardContent venueId={venueId} />;
}

export { GlassPanel } from "./GlassPanel";
