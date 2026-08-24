"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import EventCreateForm from "@/components/events/EventCreateForm";
import { EventListCard, type EventListItem } from "@/components/events/EventListCard";
import { FcCard, FcPageShell, FcSectionHeader } from "@/components/fc";
import { getFreshAuthHeaders } from "@/lib/auth/freshAuthHeaders";

type TrendPoint = {
  beacon_id: string;
  title?: string | null;
  connections_made: number;
  check_in_count: number;
  density: number;
};

export default function InsightsEventsClient() {
  const search = useSearchParams();
  const venueId = search.get("venue_id");
  const [events, setEvents] = useState<EventListItem[]>([]);
  const [trend, setTrend] = useState<TrendPoint[]>([]);

  useEffect(() => {
    if (!venueId) return;
    let cancelled = false;
    (async () => {
      const headers = await getFreshAuthHeaders();
      const [listRes, trendRes] = await Promise.all([
        fetch(`/api/insights/${venueId}/events`, { headers }),
        fetch(`/api/insights/${venueId}/network-health-trend`, { headers }),
      ]);
      if (cancelled) return;
      if (listRes.ok) {
        const json = (await listRes.json()) as { events?: EventListItem[] };
        setEvents(json.events ?? []);
      }
      if (trendRes.ok) {
        const json = (await trendRes.json()) as { events?: TrendPoint[] };
        setTrend(json.events ?? []);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [venueId]);

  return (
    <FcPageShell className="px-4 py-8">
      <FcSectionHeader title="Events" subtitle="Create venue events and review network health." />
      {!venueId ? (
        <p className="text-on-surface-variant">Select a venue to create and manage events.</p>
      ) : (
        <div className="grid gap-8 lg:grid-cols-2">
          <EventCreateForm venueId={venueId} />
          <div className="space-y-4">
            {trend.length >= 2 ? (
              <FcCard className="p-4">
                <h3 className="mb-3 font-bold">Network health trend</h3>
                <ul className="space-y-2 text-sm">
                  {trend.map((p) => (
                    <li key={p.beacon_id} className="flex justify-between gap-3">
                      <span className="text-on-surface">{p.title || "Event"}</span>
                      <span className="text-on-surface-variant">
                        {p.connections_made} connections · density {p.density.toFixed(2)}
                      </span>
                    </li>
                  ))}
                </ul>
              </FcCard>
            ) : null}
            {events.length === 0 ? (
              <FcCard className="p-6 text-sm text-on-surface-variant">
                No events at this venue yet. Create one with the form on the left.
              </FcCard>
            ) : (
              events.map((event) => <EventListCard key={event.beacon_id} event={event} />)
            )}
          </div>
        </div>
      )}
    </FcPageShell>
  );
}
