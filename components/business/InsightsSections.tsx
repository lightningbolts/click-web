"use client";

import dynamic from "next/dynamic";
import { LazyMotion, domAnimation } from "framer-motion";
import Link from "next/link";
import { Skeleton } from "@/components/ds/Skeleton";
import { InsightsDemoProvider } from "@/components/insights/InsightsDemoContext";
import { cn } from "@/lib/cn";
import type { InsightsSection } from "@/lib/places/workspace";

// recharts and MapLibre load only on Insights, one section at a time (spec §11.2).
const loading = () => <Skeleton rounded="lg" className="h-72" />;
const InsightsDashboard = dynamic(
  () => import("@/components/insights/InsightsDashboard"),
  { ssr: false, loading },
);
const PlaceInsights = dynamic(
  () => import("@/components/insights/sections/PlaceInsightsClient"),
  { ssr: false, loading },
);
const LiveMetrics = dynamic(
  () => import("@/components/insights/sections/LiveMetricsClient"),
  { ssr: false, loading },
);
const Heatmap = dynamic(
  () => import("@/components/insights/sections/HeatmapClient"),
  { ssr: false, loading },
);
const Tribes = dynamic(
  () => import("@/components/insights/sections/TribesClient"),
  { ssr: false, loading },
);
const SocialActivity = dynamic(
  () => import("@/components/insights/sections/SocialActivityClient"),
  { ssr: false, loading },
);
const VibeRadar = dynamic(
  () => import("@/components/insights/VibeRadarClient"),
  { ssr: false, loading },
);
const VibeStream = dynamic(
  () => import("@/components/insights/sections/VibeStreamClient"),
  { ssr: false, loading },
);
const EventEngagement = dynamic(
  () => import("@/components/insights/sections/EventEngagementClient"),
  { ssr: false, loading },
);
const NetworkHealth = dynamic(
  () => import("@/components/insights/sections/NetworkHealthTrend"),
  { ssr: false, loading },
);

export const INSIGHTS_NAV: { id: InsightsSection; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "traffic", label: "Traffic" },
  { id: "crowd", label: "Crowd" },
  { id: "vibe", label: "Vibe" },
  { id: "events", label: "Events" },
];

/** Left list from 1280 px, a chip row below it (spec §9.5). */
export function InsightsNav({
  placeId,
  section,
  query,
}: {
  placeId: string;
  section: InsightsSection;
  query: string;
}) {
  const base = `/business/places/${placeId}/insights`;
  return (
    <nav
      aria-label="Insights sections"
      className="xl:sticky xl:top-[calc(var(--topbar-height)+24px)] xl:w-[200px] xl:shrink-0 xl:self-start"
    >
      <ul className="no-scrollbar flex gap-2 overflow-x-auto xl:flex-col xl:gap-0.5">
        {INSIGHTS_NAV.map((item) => {
          const active = item.id === section;
          return (
            <li key={item.id} className="shrink-0">
              <Link
                href={`${item.id === "overview" ? base : `${base}/${item.id}`}${query}`}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "type-body inline-flex h-9 items-center rounded-pill px-3.5 font-semibold xl:flex xl:h-10 xl:rounded-md xl:px-3",
                  active
                    ? "bg-selection text-accent"
                    : "bg-fill-subtle text-fg hover:bg-fill-strong xl:bg-transparent xl:hover:bg-hover",
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** The consolidated Insights views (spec §9.5 mapping table), for one Place. */
export function InsightsSectionView({
  placeId,
  section,
  demo,
  range,
}: {
  placeId: string;
  section: InsightsSection;
  demo: boolean;
  range: 30 | 90;
}) {
  return (
    <InsightsDemoProvider demoMode={demo}>
      <LazyMotion features={domAnimation}>
        <div className="flex min-w-0 flex-col gap-10">
          {section === "overview" ? (
            <>
              <InsightsDashboard venueId={placeId} />
              <PlaceInsights placeId={placeId} range={range} />
              <LiveMetrics placeId={placeId} />
            </>
          ) : section === "traffic" ? (
            <Heatmap placeId={placeId} />
          ) : section === "crowd" ? (
            <>
              <Tribes placeId={placeId} />
              <SocialActivity placeId={placeId} />
            </>
          ) : section === "vibe" ? (
            <>
              <VibeRadar placeId={placeId} initialPayload={null} />
              <VibeStream placeId={placeId} />
            </>
          ) : (
            <>
              <EventEngagement placeId={placeId} />
              <NetworkHealth placeId={placeId} />
            </>
          )}
        </div>
      </LazyMotion>
    </InsightsDemoProvider>
  );
}
