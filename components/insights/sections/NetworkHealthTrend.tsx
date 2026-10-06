"use client";

import useSWR from "swr";
import { ChartCard, NotEnoughData } from "@/components/insights/ChartCard";
import { RetryRow } from "@/components/ds/RetryRow";
import { Skeleton } from "@/components/ds/Skeleton";
import { authedJson } from "@/lib/api/authedJson";

type TrendPoint = {
  beacon_id: string;
  title?: string | null;
  connections_made: number;
  check_in_count: number;
  density: number;
};

/** Clicks made per event at this Place, oldest to newest (spec §9.5 Insights › Events). */
export default function NetworkHealthTrend({ placeId }: { placeId: string }) {
  const { data, error, isLoading, mutate } = useSWR(`/api/insights/${placeId}/network-health-trend`, (url: string) =>
    authedJson<{ events?: TrendPoint[] }>(url),
  );
  if (error) return <RetryRow thing="network health" onRetry={() => void mutate()} />;
  if (isLoading || !data) return <Skeleton rounded="lg" className="h-64" />;
  const points = data.events ?? [];
  const max = Math.max(1, ...points.map((p) => p.connections_made));
  return (
    <ChartCard
      title="Network health by event"
      subtitle={`n = ${points.length} ${points.length === 1 ? "event" : "events"}`}
      info="How many new Clicks each event produced, and Clicks per person who checked in."
    >
      {points.length < 2 ? (
        <NotEnoughData n={points.length} unit="events" />
      ) : (
        <ul className="flex flex-col gap-3">
          {points.map((p) => (
            <li key={p.beacon_id}>
              <div className="type-meta flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate text-fg">{p.title || "Event"}</span>
                <span className="tabular shrink-0 text-fg-secondary">
                  {p.connections_made} Clicks · {p.density.toFixed(2)} per check-in
                </span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-pill bg-fill-subtle" aria-hidden>
                <div className="h-full rounded-pill bg-action" style={{ width: `${(p.connections_made / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </ChartCard>
  );
}
