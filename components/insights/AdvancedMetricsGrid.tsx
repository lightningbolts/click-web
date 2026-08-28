"use client";

import { useMemo } from "react";
import useSWR from "swr";
import { motion } from "framer-motion";
import { Anchor, AudioLines, GitBranch, HeartHandshake, Info } from "lucide-react";
import { fetchInsightsApiJson } from "@/lib/insights/fetchInsightsApi";
import type { AdvancedMetricsApiResponse } from "@/lib/insights/advancedMetrics";
import { GlassPanel } from "./GlassPanel";
import { InsightCallout } from "./InsightCallout";

const fetcher = (url: string) => fetchInsightsApiJson<AdvancedMetricsApiResponse>(url);

function noiseRecommendation(acoustic: AdvancedMetricsApiResponse["acousticConversion"]): {
  label: string;
  detail: string;
} {
  const entries = (
    Object.entries(acoustic) as [keyof typeof acoustic, number | undefined][]
  ).filter(([, v]) => typeof v === "number" && !Number.isNaN(v)) as [string, number][];

  if (entries.length === 0) {
    return {
      label: "—",
      detail: "Not enough noise-level data yet. Connections will fill this in over time.",
    };
  }

  const sorted = [...entries].sort((a, b) => b[1] - a[1]);
  const best = sorted[0];
  const key = best[0];
  const upper = key.charAt(0).toUpperCase() + key.slice(1);
  return {
    label: upper,
    detail: `Highest retention (${best[1].toFixed(1)}%) occurred in the ${upper.toLowerCase()} noise bucket.`,
  };
}

function AdvancedMetricsSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="bg-surface-container rounded-2xl h-44 animate-pulse border border-border-hard" />
      ))}
    </div>
  );
}

export default function AdvancedMetricsGrid({
  venueId,
  staticData,
}: {
  venueId?: string;
  staticData?: AdvancedMetricsApiResponse | null;
}) {
  const url =
    staticData || !venueId ? null : `/api/insights/${venueId}/advanced-metrics`;
  const { data: swrData, error, isLoading } = useSWR<AdvancedMetricsApiResponse>(
    url,
    fetcher,
  );
  const data = staticData ?? swrData;

  const acr = useMemo(
    () => (data ? noiseRecommendation(data.acousticConversion) : null),
    [data],
  );

  const topAnchors = useMemo(() => {
    if (!data?.anchorMagnetism?.length) return [];
    return [...data.anchorMagnetism]
      .sort((a, b) => b.ams_score - a.ams_score)
      .slice(0, 3);
  }, [data]);

  const maxAms = useMemo(() => {
    if (!topAnchors.length) return 1;
    return Math.max(...topAnchors.map((a) => a.ams_score), 1e-9);
  }, [topAnchors]);

  if (!venueId && !staticData) {
    return null;
  }

  if (isLoading && !error && !staticData) {
    return (
      <div className="space-y-3">
        <h2 className="text-sm font-medium text-on-surface-variant tracking-wide">Advanced Social ROI</h2>
        <AdvancedMetricsSkeleton />
      </div>
    );
  }

  if (error || !data) {
    return null;
  }

  const peers = data.peerPercentiles;

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-medium text-on-surface-variant tracking-wide">Advanced Social ROI</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
        >
          <GlassPanel className="p-6 h-full" hover glow="purple">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-primary/20 rounded-lg">
                <HeartHandshake className="w-4 h-4 text-primary" />
              </div>
              <span className="text-sm font-medium text-on-surface-variant">
                Venue Loyalty Coefficient
              </span>
            </div>
            <div className="text-4xl font-semibold text-on-surface tabular-nums">
              {data.venueLoyaltyCoefficient.toFixed(1)}%
            </div>
            <p className="text-xs text-on-surface-variant mt-3 leading-relaxed">
              Return visitors after connecting — share of guests who came back to this venue more
              than 24 hours after their first connection here.
            </p>
            <InsightCallout
              value={data.venueLoyaltyCoefficient}
              metricKey="vlc"
              peerPercentile={peers?.vlc ?? undefined}
              peerCohortSize={
                peers?.vlc != null ? peers.cohortSize : undefined
              }
            />
          </GlassPanel>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: 0.05 }}
        >
          <GlassPanel className="p-6 h-full" hover glow="blue">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-primary/20 rounded-lg">
                <Anchor className="w-4 h-4 text-primary" />
              </div>
              <span className="text-sm font-medium text-on-surface-variant">Anchor Magnetism</span>
            </div>
            {topAnchors.length === 0 ? (
              <p className="text-sm text-on-surface-variant">
                Link connections to NFC anchors to rank tap points by magnetism.
              </p>
            ) : (
              <ul className="space-y-3">
                {topAnchors.map((a, i) => (
                  <li key={a.nfc_anchor_id} className="space-y-1.5">
                    <div className="flex justify-between text-xs text-on-surface-variant">
                      <span className="text-on-surface truncate pr-2">
                        {i + 1}. {a.name}
                      </span>
                      <span className="tabular-nums shrink-0 text-on-surface-variant">
                        {(a.ams_score * 100).toFixed(2)}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-surface-container-high overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${(a.ams_score / maxAms) * 100}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </GlassPanel>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: 0.1 }}
        >
          <GlassPanel className="p-6 h-full" hover>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-emerald-500/20 rounded-lg">
                <AudioLines className="w-4 h-4 text-emerald-700 dark:text-emerald-300" />
              </div>
              <span className="text-sm font-medium text-on-surface-variant">Acoustic Conversion</span>
            </div>
            <p className="text-lg text-on-surface font-medium">
              Optimal social noise level:{" "}
              <span className="text-emerald-700 dark:text-emerald-300">{acr?.label}</span>
            </p>
            <p className="text-xs text-on-surface-variant mt-3 leading-relaxed">{acr?.detail}</p>
          </GlassPanel>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: 0.15 }}
        >
          <GlassPanel className="p-6 h-full" hover glow="green">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-green-500/20 rounded-lg">
                <GitBranch className="w-4 h-4 text-green-700 dark:text-green-400" />
              </div>
              <span className="text-sm font-medium text-on-surface-variant">Cross-Pollination</span>
              <span
                className="inline-flex items-center justify-center ml-auto text-on-surface-variant"
                title="Connections across different interest groups — share of connections where both people share at most one overlapping interest tag."
              >
                <Info className="w-4 h-4" aria-hidden />
                <span className="sr-only">
                  Connections across different interest groups — overlap of one or zero shared tags.
                </span>
              </span>
            </div>
            <div className="text-4xl font-semibold text-on-surface tabular-nums">
              {data.crossPollinationRate.toFixed(1)}%
            </div>
            <p className="text-xs text-on-surface-variant mt-3 leading-relaxed">
              Share of connections with little or no tag overlap — bridging different circles.
            </p>
          </GlassPanel>
        </motion.div>
      </div>
    </div>
  );
}
