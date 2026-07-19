"use client";

import { useMemo } from "react";
import useSWR from "swr";
import { motion } from "framer-motion";
import { CloudRain, Sun, Zap, UsersRound } from "lucide-react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { fetchInsightsApiJson } from "@/lib/insights/fetchInsightsApi";
import type { AdvancedMetricsApiResponse } from "@/lib/insights/advancedMetrics";
import { GlassPanel } from "./GlassPanel";
import { InsightCallout } from "./InsightCallout";

const TEAL = "#2dd4bf";
const AMBER = "#f59e0b";

const fetcher = (url: string) => fetchInsightsApiJson<AdvancedMetricsApiResponse>(url);

function formatVibeHour(hour: number): string {
  const safe = Math.min(23, Math.max(0, Math.floor(hour)));
  const d = new Date(2000, 0, 1, safe, 0, 0, 0);
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function EnvironmentalSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
      {[0, 1, 2].map((i) => (
        <div key={i} className="bg-white/5 rounded-2xl h-52 animate-pulse border border-white/5" />
      ))}
    </div>
  );
}

export default function EnvironmentalMetrics({
  venueId,
  staticData,
}: {
  venueId?: string;
  /** When set, skips fetch and renders this payload (e.g. demo mode). */
  staticData?: AdvancedMetricsApiResponse | null;
}) {
  const url =
    staticData || !venueId ? null : `/api/insights/${venueId}/advanced-metrics`;
  const { data: swrData, error, isLoading } = useSWR<AdvancedMetricsApiResponse>(
    url,
    fetcher,
  );
  const data = staticData ?? swrData;

  const sparkData = useMemo(() => {
    const avgs = data?.peakSocialVelocity?.hourlyAverages ?? [];
    return avgs.map((value, hour) => ({
      hour,
      value,
      label: `${hour}`,
    }));
  }, [data]);

  const peakHour = data?.peakSocialVelocity?.peakHour ?? 0;

  if (!venueId && !staticData) {
    return null;
  }

  if (isLoading && !error && !staticData) {
    return (
      <div className="space-y-3">
        <h2 className="text-sm font-medium text-on-surface-variant tracking-wide">Environment &amp; flow</h2>
        <EnvironmentalSkeleton />
      </div>
    );
  }

  if (error || !data) {
    return null;
  }

  const wri = data.weatherResilience;
  const psv = data.peakSocialVelocity;
  const gcr = data.groupClusteringRate;
  const peers = data.peerPercentiles;

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-medium text-on-surface-variant tracking-wide">Environment &amp; flow</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
          <GlassPanel className="p-6 h-full" hover glow="none">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-teal-500/15 border border-teal-500/25">
                <Sun className="w-4 h-4" style={{ color: TEAL }} />
              </div>
              <span className="text-sm font-medium text-on-surface-variant">Weather Resilience</span>
            </div>
            <p className="text-xs text-on-surface-variant mb-4 leading-relaxed">
              How weather impacts your social foot traffic.
            </p>
            <div className="flex items-stretch justify-between gap-3">
              <div
                className="flex-1 rounded-xl border border-teal-500/20 bg-teal-500/5 px-3 py-3 flex flex-col items-center gap-1"
                title="Average daily connections on fair-weather (clear / sunny) majority days"
              >
                <Sun className="w-5 h-5 mb-1" style={{ color: TEAL }} />
                <span className="text-[10px] uppercase tracking-wider text-on-surface-variant">Fair days</span>
                <span className="text-lg font-semibold text-on-surface tabular-nums">
                  {wri.avgDailyFair.toFixed(1)}
                </span>
                <span className="text-[10px] text-outline">{wri.fairDays} days</span>
              </div>
              <div
                className="flex-1 rounded-xl border border-amber-500/25 bg-amber-500/5 px-3 py-3 flex flex-col items-center gap-1"
                title="Average daily connections on rain / snow majority days"
              >
                <CloudRain className="w-5 h-5 mb-1" style={{ color: AMBER }} />
                <span className="text-[10px] uppercase tracking-wider text-on-surface-variant">Rain / snow</span>
                <span className="text-lg font-semibold text-on-surface tabular-nums">
                  {wri.avgDailyAdverse.toFixed(1)}
                </span>
                <span className="text-[10px] text-outline">{wri.adverseDays} days</span>
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-border-hard text-center">
              <span className="text-xs text-on-surface-variant">Resilience index </span>
              <span className="text-sm font-semibold tabular-nums" style={{ color: TEAL }}>
                {wri.index === null ? "—" : wri.index.toFixed(2)}
              </span>
              <span className="text-[10px] text-outline block mt-1">
                Adverse ÷ fair daily averages (above 1 means stronger traffic on rough-weather days)
              </span>
            </div>
            {wri.index !== null && !Number.isNaN(wri.index) ? (
              <InsightCallout
                value={wri.index}
                metricKey="wri"
                peerPercentile={peers?.wri ?? undefined}
                peerCohortSize={
                  peers?.wri != null ? peers.cohortSize : undefined
                }
              />
            ) : null}
          </GlassPanel>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, delay: 0.05 }}
        >
          <GlassPanel className="p-6 h-full" hover glow="none">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-lg bg-amber-500/15 border border-amber-500/25">
                <Zap className="w-4 h-4" style={{ color: AMBER }} />
              </div>
              <span className="text-sm font-medium text-on-surface-variant">Peak Social Velocity</span>
            </div>
            <div className="mb-2">
              <span className="text-xs text-on-surface-variant">Vibe hour </span>
              <span className="text-xl font-semibold text-on-surface">{formatVibeHour(peakHour)}</span>
            </div>
            <p className="text-xs text-on-surface-variant mb-3">
              Velocity {(psv.velocity ?? 0).toFixed(2)}× vs average hour · {psv.numDistinctDays} active days
            </p>
            <div className="w-full min-w-0 overflow-hidden">
              <ResponsiveContainer width="100%" height={100} minWidth={0} minHeight={80}>
                <LineChart data={sparkData} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
                  <XAxis dataKey="hour" hide />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "rgba(0,0,0,0.85)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: "8px",
                      fontSize: "11px",
                    }}
                    labelFormatter={(h) => `Hour ${h}`}
                    formatter={(v: number) => [`${v.toFixed(2)} / day`, "Avg"]}
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke={TEAL}
                    strokeWidth={2}
                    dot={(dotProps: { cx?: number; cy?: number; payload?: { hour?: number } }) => {
                      const { cx, cy, payload } = dotProps;
                      if (
                        payload?.hour !== peakHour ||
                        cx === undefined ||
                        cy === undefined
                      ) {
                        return false;
                      }
                      return (
                        <circle cx={cx} cy={cy} r={4} fill={AMBER} stroke="#fff" strokeWidth={1} />
                      );
                    }}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <InsightCallout
              value={psv.velocity ?? 0}
              metricKey="psv_velocity"
              peerPercentile={peers?.psv_velocity ?? undefined}
              peerCohortSize={
                peers?.psv_velocity != null ? peers.cohortSize : undefined
              }
            />
          </GlassPanel>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, delay: 0.1 }}
        >
          <GlassPanel className="p-6 h-full" hover glow="none">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-teal-500/15 border border-teal-500/25">
                <UsersRound className="w-4 h-4" style={{ color: TEAL }} />
              </div>
              <span className="text-sm font-medium text-on-surface-variant">Social Flow (GCR)</span>
            </div>
            <p className="text-xs text-on-surface-variant mb-4 leading-relaxed">
              Share of connections where someone quickly met again at your venue — group mingling vs
              intimate 1:1 pace.
            </p>
            <div className="space-y-2">
              <div className="flex h-3 w-full rounded-full overflow-hidden bg-white/10 ring-1 ring-white/10">
                <div
                  className="h-full shrink-0 transition-all duration-500 rounded-l-full"
                  style={{
                    width: `${Math.min(100, Math.max(0, gcr))}%`,
                    background: `linear-gradient(90deg, ${TEAL}, ${TEAL}cc)`,
                  }}
                  title="Group mingling (high GCR)"
                />
                <div
                  className="h-full shrink-0 rounded-r-full"
                  style={{
                    width: `${Math.min(100, Math.max(0, 100 - gcr))}%`,
                    background: `linear-gradient(90deg, ${AMBER}44, ${AMBER}22)`,
                  }}
                  title="Intimate 1:1 (lower GCR)"
                />
              </div>
              <div className="flex justify-between text-[11px] text-on-surface-variant">
                <span style={{ color: TEAL }}>Group mingling {gcr.toFixed(1)}%</span>
                <span style={{ color: AMBER }}>
                  Intimate 1:1 {(100 - gcr).toFixed(1)}%
                </span>
              </div>
            </div>
            {/* Simple radial-style gauge using conic gradient */}
            <div className="mt-5 flex justify-center">
              <div
                className="relative h-24 w-24 rounded-full"
                style={{
                  background: `conic-gradient(${TEAL} 0deg ${(gcr / 100) * 360}deg, ${AMBER}33 ${(gcr / 100) * 360}deg 360deg)`,
                  boxShadow: "0 0 24px rgba(45,212,191,0.15)",
                }}
              >
                <div className="absolute inset-2 rounded-full bg-background/95 flex flex-col items-center justify-center border border-border-hard">
                  <span className="text-lg font-bold text-on-surface tabular-nums">{gcr.toFixed(0)}%</span>
                  <span className="text-[9px] text-on-surface-variant uppercase tracking-wide">GCR</span>
                </div>
              </div>
            </div>
            <InsightCallout
              value={gcr}
              metricKey="gcr"
              peerPercentile={peers?.gcr ?? undefined}
              peerCohortSize={
                peers?.gcr != null ? peers.cohortSize : undefined
              }
            />
          </GlassPanel>
        </motion.div>
      </div>
    </div>
  );
}
