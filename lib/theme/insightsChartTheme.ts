"use client";

import { useMemo } from "react";
import { useTheme } from "@/lib/theme/ThemeProvider";

/**
 * Theme-aware Recharts colors for Business Insights.
 * Prefer these over hardcoded white/rgba(255,…) fills that fail in light mode.
 */
export function useInsightsChartTheme() {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  return useMemo(
    () => ({
      isDark,
      muted: isDark ? "rgba(240,241,241,0.45)" : "rgba(26,28,28,0.45)",
      axis: isDark ? "rgba(240,241,241,0.2)" : "rgba(26,28,28,0.2)",
      grid: isDark ? "rgba(240,241,241,0.08)" : "rgba(26,28,28,0.08)",
      tooltipBg: isDark ? "#1a1c1c" : "#ffffff",
      tooltipBorder: isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.15)",
      tooltipText: isDark ? "#f0f1f1" : "#1a1c1c",
      tooltipLabel: isDark ? "rgba(240,241,241,0.65)" : "rgba(74,68,85,0.9)",
      cursor: isDark ? "rgba(255,255,255,0.05)" : "rgba(99,14,212,0.08)",
      barMuted: isDark ? "rgba(255,255,255,0.12)" : "rgba(26,28,28,0.12)",
      barMutedStrong: isDark ? "rgba(255,255,255,0.1)" : "rgba(26,28,28,0.1)",
      track: isDark ? "rgba(255,255,255,0.07)" : "rgba(26,28,28,0.08)",
      primary: "#630ed4",
      pieLabel: isDark ? "rgba(255,255,255,0.7)" : "rgba(26,28,28,0.7)",
      ring: isDark ? "rgba(255,255,255,0.1)" : "rgba(26,28,28,0.12)",
    }),
    [isDark],
  );
}

export type InsightsChartTheme = ReturnType<typeof useInsightsChartTheme>;
