"use client";

import { useEffect } from "react";
import type { ReactNode } from "react";
import { useAuth } from "@/lib/AuthContext";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { motion } from "framer-motion";
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
} from "@/lib/insights/mockData";
import type { VibeMessage } from "@/lib/insights/mockData";
import { fetchInsightsApiJson } from "@/lib/insights/fetchInsightsApi";

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

const fetcher = (url: string) => fetchInsightsApiJson<InsightsResponse>(url);

/**
 * InsightsSkeleton - Bento-grid loading skeleton with rounded corners
 */
function InsightsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
        {[0, 1, 2].map((i) => (
          <div key={i} className="bg-white/5 rounded-2xl h-52 animate-pulse" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        {[0, 1].map((i) => (
          <div
            key={i}
            className="bg-white/5 rounded-2xl h-[380px] animate-pulse"
          />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        <div className="bg-white/5 rounded-2xl h-80 lg:col-span-2 animate-pulse" />
        <div className="bg-white/5 rounded-2xl h-80 animate-pulse" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="bg-white/5 rounded-2xl h-36 animate-pulse" />
        ))}
      </div>
      <div className="bg-white/5 rounded-2xl h-52 animate-pulse" />
    </div>
  );
}

/**
 * InsightsDashboard - The main content component for the Insights page
 * Contains all the bento box cards and charts
 */
function InsightsDashboardContent({ venueId }: { venueId?: string }) {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const liveCount = emptyLiveCount;
  const vibeMessages: VibeMessage[] = [];

  const insightsUrl = venueId ? `/api/insights/${venueId}` : "/api/insights/venue";
  const { data: apiData, error, isLoading } = useSWR<InsightsResponse>(
    user ? insightsUrl : null,
    fetcher,
  );

  const data = apiData;

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
            className="bg-white/5 backdrop-blur-md border border-white/10 p-8 rounded-3xl max-w-md text-center"
          >
            <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-white mb-2">
              Access Denied
            </h1>
            <p className="text-zinc-400 mb-6">
              This dashboard is only available to verified business partners.
            </p>
            <button
              onClick={() => router.push("/")}
              className="bg-[#8338EC] hover:bg-[#8338EC]/80 text-white px-6 py-3 rounded-xl transition-colors"
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
          className="bg-white/5 backdrop-blur-md border border-white/10 p-8 rounded-3xl max-w-md text-center"
        >
          <AlertCircle className="w-16 h-16 text-amber-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-white mb-2">
            Could not load insights
          </h1>
          <p className="text-zinc-400 mb-6">
            Something went wrong. Please refresh or try again later.
          </p>
          <button
            type="button"
            onClick={() => router.refresh()}
            className="bg-[#8338EC] hover:bg-[#8338EC]/80 text-white px-6 py-3 rounded-xl transition-colors"
          >
            Retry
          </button>
        </motion.div>
      </div>
    );
  }

  if (data?.status === "insufficient_data") {
    return (
      <div className="flex items-center justify-center p-4 min-h-[400px]">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white/5 backdrop-blur-md border border-white/10 p-8 rounded-3xl max-w-md text-center"
        >
          <Users className="w-16 h-16 text-zinc-600 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-white mb-2">
            Insufficient Data
          </h1>
          <p className="text-zinc-400 mb-6">
            {data.message ||
              "We need at least 5 connections to generate insights to protect user privacy."}
          </p>
          <button
            onClick={() => router.push("/")}
            className="bg-[#8338EC] hover:bg-[#8338EC]/80 text-white px-6 py-3 rounded-xl transition-colors"
          >
            Back to your dashboard
          </button>
        </motion.div>
      </div>
    );
  }

  // Prepare data for charts
  const hourlyData =
    data?.hourlyDistribution?.map((count: number, hour: number) => ({
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
      {data?.status === "no_venue" && data.message ? (
        <motion.div
          variants={itemVariants}
          className="rounded-2xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100/95"
        >
          {data.message}
        </motion.div>
      ) : null}

      {/* TOP ROW: Metric Cards */}
      <motion.div
        variants={itemVariants}
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6"
      >
        <StickyScoreCard data={emptyStickyScore} />
        <ConnectionDensityCard data={emptyConnectionDensity} />
        <LiveCountCard data={liveCount} />
      </motion.div>

      {/* SECOND ROW: Heatmap + Tribe Analysis */}
      <motion.div
        variants={itemVariants}
        className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6"
      >
        <HeatmapView zones={[]} />
        <TribeChart tribes={[]} />
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
              <span className="text-sm font-medium text-zinc-400">
                Social Activity
              </span>
            </div>
            <span className="text-xs text-zinc-500">Last 30 days</span>
          </div>
          <div className="h-[280px] w-full min-h-[280px] min-w-0">
            <ResponsiveContainer
              width="100%"
              height="100%"
              minWidth={0}
              minHeight={200}
            >
              <LineChart data={data?.dailyData || []}>
                <defs>
                  <linearGradient
                    id="colorGradient"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="5%" stopColor="#8338EC" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#8338EC" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(255,255,255,0.05)"
                  vertical={false}
                />
                <XAxis
                  dataKey="date"
                  stroke="rgba(255,255,255,0.2)"
                  tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }}
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
                  axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
                />
                <YAxis
                  stroke="rgba(255,255,255,0.2)"
                  tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }}
                  axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "rgba(0,0,0,0.9)",
                    borderColor: "rgba(255,255,255,0.1)",
                    borderRadius: "12px",
                    boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
                  }}
                  itemStyle={{ color: "#fff" }}
                  labelStyle={{ color: "rgba(255,255,255,0.6)" }}
                />
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke="#8338EC"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{
                    r: 6,
                    fill: "#8338EC",
                    stroke: "#fff",
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
            <span className="text-sm font-medium text-zinc-400">
              Total Connections
            </span>
          </div>
          <div className="text-3xl font-bold text-white">
            {data?.totalConnections || 0}
          </div>
          <div className="text-xs text-zinc-500 mt-2">Last 30 days</div>
        </GlassPanel>

        <GlassPanel className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-green-500/20 rounded-lg">
              <TrendingUp className="w-4 h-4 text-green-500" />
            </div>
            <span className="text-sm font-medium text-zinc-400">
              Retention Rate
            </span>
          </div>
          <div className="text-3xl font-bold text-white">
            {data?.retentionRate || "N/A"}
          </div>
          <div className="text-xs text-zinc-500 mt-2">Returning visitors</div>
        </GlassPanel>

        <GlassPanel className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-orange-500/20 rounded-lg">
              <Calendar className="w-4 h-4 text-orange-500" />
            </div>
            <span className="text-sm font-medium text-zinc-400">
              Busiest Day
            </span>
          </div>
          <div className="text-2xl font-bold text-white">
            {data?.busiestDay || "N/A"}
          </div>
          <div className="text-xs text-zinc-500 mt-2">Highest activity</div>
        </GlassPanel>

        <GlassPanel className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-[#3A86FF]/20 rounded-lg">
              <Clock className="w-4 h-4 text-[#3A86FF]" />
            </div>
            <span className="text-sm font-medium text-zinc-400">Peak Hour</span>
          </div>
          <div className="text-3xl font-bold text-white">
            {data?.peakHour ?? "N/A"}:00
          </div>
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
              <span className="text-sm font-medium text-zinc-400">
                Popular Times
              </span>
            </div>
            <span className="text-xs text-zinc-500">Hourly distribution</span>
          </div>
          <div className="h-[200px] w-full min-h-[200px] min-w-0">
            <ResponsiveContainer
              width="100%"
              height="100%"
              minWidth={0}
              minHeight={150}
            >
              <BarChart data={hourlyData}>
                <XAxis
                  dataKey="hour"
                  stroke="rgba(255,255,255,0.2)"
                  tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }}
                  interval={2}
                  axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
                />
                <Tooltip
                  cursor={{ fill: "rgba(255,255,255,0.05)" }}
                  contentStyle={{
                    backgroundColor: "rgba(0,0,0,0.9)",
                    borderColor: "rgba(255,255,255,0.1)",
                    borderRadius: "12px",
                  }}
                  itemStyle={{ color: "#fff" }}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {hourlyData.map((entry: any, index: number) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={
                        index === data?.peakHour
                          ? "#8338EC"
                          : "rgba(255,255,255,0.15)"
                      }
                      style={
                        index === data?.peakHour
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
          <div className="mt-4 text-center text-xs text-zinc-400">
            Peak activity is around{" "}
            <span className="text-[#8338EC] font-bold">
              {data?.peakHour}:00
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

/**
 * GlassPanel - Reusable glassmorphism panel component
 */
interface GlassPanelProps {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  glow?: "purple" | "blue" | "green" | "none";
}

export function GlassPanel({
  children,
  className = "",
  hover = true,
  glow = "none",
}: GlassPanelProps) {
  const glowColors = {
    purple: "hover:shadow-[0_0_30px_-5px_rgba(131,56,236,0.3)]",
    blue: "hover:shadow-[0_0_30px_-5px_rgba(58,134,255,0.3)]",
    green: "hover:shadow-[0_0_30px_-5px_rgba(34,197,94,0.3)]",
    none: "",
  };

  return (
    <motion.div
      whileHover={hover ? { scale: 1.01, y: -2 } : undefined}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
      className={`
        bg-white/5 backdrop-blur-md
        border border-white/10
        rounded-2xl
        transition-all duration-300
        ${hover ? "hover:bg-white/[0.07] hover:border-white/20" : ""}
        ${glowColors[glow]}
        ${className}
      `}
    >
      {children}
    </motion.div>
  );
}
