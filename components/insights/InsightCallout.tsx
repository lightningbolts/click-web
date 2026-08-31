"use client";

import { useCallback, useState } from "react";
import { Lightbulb } from "lucide-react";

export type InsightMetricKey =
  | "sticky_score"
  | "gcr"
  | "vlc"
  | "psv_velocity"
  | "wri"
  | "connection_density";

/** Prescriptive copy for a metric value; optional peer percentile for benchmarking. */
export interface InsightCalloutProps {
  value: number;
  metricKey: InsightMetricKey;
  /** 0–100 vs similar venues (when you have a cohort). */
  peerPercentile?: number;
  /** Venues in the peer set (when returned by the API). */
  peerCohortSize?: number;
}

function formatOrdinal(n: number): string {
  const rounded = Math.round(n);
  const r = rounded % 100;
  if (r >= 11 && r <= 13) return `${rounded}th`;
  switch (rounded % 10) {
    case 1:
      return `${rounded}st`;
    case 2:
      return `${rounded}nd`;
    case 3:
      return `${rounded}rd`;
    default:
      return `${rounded}th`;
  }
}

function firstSentence(text: string): string {
  const idx = text.indexOf(". ");
  if (idx === -1) return text;
  return text.slice(0, idx + 1);
}

function recommendationFor(
  value: number,
  metricKey: InsightMetricKey,
): string | null {
  switch (metricKey) {
    case "sticky_score":
      if (value < 40) {
        return "Your venue isn't creating lasting social moments yet. Try structured prompts at entry points — a question board, a shared activity, anything that gives strangers a reason to talk.";
      }
      if (value <= 70) {
        return "Solid community foundation. Focus on the 30-minute window after peak arrival — that's when most connections form or don't.";
      }
      return "Strong social gravity. Consider surfacing your top cohort (repeat connectors) with a loyalty perk to reward ambassadors.";
    case "gcr":
      if (value < 30) {
        return "Most connections here are intimate 1:1s. Great for deep relationships but slow community growth. Add high-top communal tables or hosted group activities.";
      }
      if (value <= 60) {
        return "Healthy mix of 1:1 and group mingling.";
      }
      return "High group mingling. Make sure there are quieter zones for follow-up conversations — otherwise connections form but don't deepen.";
    case "vlc":
      if (value < 20) {
        return "Few guests return after their first connection here. Consider a follow-up prompt 7 days after a connection inviting both people back to your venue.";
      }
      if (value <= 50) {
        return "Moderate return rate. Your venue is memorable — focus on why the top 20% return and replicate that experience.";
      }
      return "Exceptional loyalty. You're a genuine third place. This is a strong signal for sponsorship pitches.";
    case "psv_velocity":
      if (value < 1.5) {
        return "No strong peak hour — activity is spread evenly. This could mean programming is too passive. Try a weekly social anchor event.";
      }
      if (value <= 3) {
        return "Clear social peak. Staff this window heavily and ensure ambient conditions (lighting, volume, layout) are optimized.";
      }
      return "Very sharp peak. Risk of overcrowding killing connection quality. Consider a second programming window to distribute social energy.";
    case "wri":
      if (value < 0.7) {
        return "Bad weather hurts you significantly. You're an outdoor-dependent venue socially. Consider covered or indoor connection zones.";
      }
      if (value <= 1.1) {
        return "Weather-neutral — your social activity is consistent. Strong signal for year-round programming.";
      }
      return "Counterintuitively, your best social days are rainy ones. Lean into cozy indoor events when weather is poor.";
    case "connection_density":
      if (value < 3) {
        return "Connection density is low for your footprint. Try moving anchors or prompts into under-used zones to spread social energy.";
      }
      if (value <= 8) {
        return "Balanced density — a few hot zones are carrying most exchanges. Consider duplicating what works in quieter corners.";
      }
      return "Very high density in pockets. Watch for crowding at choke points; add overflow space so new connections stay comfortable.";
    default:
      return null;
  }
}

export function InsightCallout({
  value,
  metricKey,
  peerPercentile,
  peerCohortSize,
}: InsightCalloutProps) {
  const full = recommendationFor(value, metricKey);
  const [hover, setHover] = useState(false);
  const [pinned, setPinned] = useState(false);
  const expanded = hover || pinned;

  const togglePin = useCallback(() => {
    setPinned((p) => !p);
  }, []);

  if (!full) return null;

  const collapsed = firstSentence(full);
  const showPeer =
    peerPercentile !== undefined &&
    peerPercentile >= 0 &&
    peerPercentile <= 100;

  return (
    <div
      role="button"
      tabIndex={0}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={togglePin}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          togglePin();
        }
      }}
      className="mt-3 flex cursor-pointer gap-2 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] px-3 py-2.5 text-left shadow-[inset_0_0_0_1px_rgba(124,58,237,0.12)] outline-none transition-colors hover:border-violet-500/30 focus-visible:ring-2 focus-visible:ring-primary/40"
      aria-expanded={expanded}
    >
      <Lightbulb
        className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300"
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <p className="text-xs italic leading-relaxed text-on-surface-variant md:text-sm">
          {expanded ? full : collapsed}
        </p>
        {showPeer && (
          <p className="mt-2 text-[11px] not-italic leading-relaxed text-on-surface-variant">
            Compared with similar venues in our network, you&apos;re near the{" "}
            <span className="tabular-nums text-on-surface-variant">
              {formatOrdinal(peerPercentile)}
            </span>{" "}
            percentile for this metric.
            {peerCohortSize !== undefined && peerCohortSize > 0 ? (
              <>
                {" "}
                Cohort:{" "}
                <span className="tabular-nums text-on-surface-variant">{peerCohortSize}</span> venues with
                enough traffic to compare.
              </>
            ) : null}
          </p>
        )}
        <p className="mt-1 text-[10px] not-italic text-outline md:hidden">
          Tap to {pinned ? "collapse" : "expand"}
        </p>
      </div>
    </div>
  );
}
