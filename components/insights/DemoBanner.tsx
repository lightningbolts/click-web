"use client";

import { Sparkles } from "lucide-react";
import { useInsightsDemo } from "./InsightsDemoContext";

export function DemoBanner() {
  const { setDemoMode } = useInsightsDemo();

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-violet-500/30 bg-gradient-to-r from-violet-500/15 to-amber-500/10 px-4 py-3 text-sm text-zinc-200 sm:flex-row sm:items-start">
      <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-violet-300" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-white">Demo data</p>
        <p className="mt-1 text-zinc-400 leading-relaxed">
          Sample Business Insights so you can explore heatmaps, tribes, and metrics before your venue has enough real traffic.
          Turn this off anytime to see only live data (or when your venue is linked and over the privacy threshold).
        </p>
      </div>
      <button
        type="button"
        onClick={() => setDemoMode(false)}
        className="shrink-0 self-start rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-xs font-medium text-white transition-colors hover:border-violet-400/40 hover:bg-violet-500/10"
      >
        Use live data
      </button>
    </div>
  );
}
