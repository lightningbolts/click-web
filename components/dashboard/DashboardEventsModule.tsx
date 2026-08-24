"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FcButton, FcCard, FcSectionHeader } from "@/components/fc";
import { EventListCard, type EventListItem } from "@/components/events/EventListCard";
import { getFreshAuthHeaders } from "@/lib/auth/freshAuthHeaders";

export default function DashboardEventsModule() {
  const [events, setEvents] = useState<Array<EventListItem & { role?: string }>>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const headers = await getFreshAuthHeaders();
      const res = await fetch("/api/beacons/mine", { headers });
      if (cancelled) return;
      if (!res.ok) {
        setError("Could not load your events.");
        return;
      }
      const json = (await res.json()) as { events?: Array<EventListItem & { role?: string }> };
      setEvents(json.events ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const created = events.filter((e) => e.role === "creator");
  const rsvps = events.filter((e) => e.role !== "creator");

  return (
    <div className="space-y-8" data-testid="dashboard-events-module">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <FcSectionHeader title="Events" subtitle="Events you host or plan to attend." />
        <Link href="/events/new">
          <FcButton type="button">Create event</FcButton>
        </Link>
      </div>
      {error ? <p className="text-error">{error}</p> : null}
      <section className="space-y-3">
        <h3 className="text-sm font-bold uppercase tracking-wide text-on-surface-variant">My events</h3>
        {created.length === 0 ? (
          <FcCard className="space-y-3 p-6">
            <p className="text-sm text-on-surface-variant">You have not created an event yet.</p>
            <Link href="/events/new" className="inline-flex">
              <FcButton type="button">Create event</FcButton>
            </Link>
          </FcCard>
        ) : (
          <div className="space-y-3">
            {created.map((event) => (
              <EventListCard key={event.beacon_id} event={event} />
            ))}
          </div>
        )}
      </section>
      <section className="space-y-3">
        <h3 className="text-sm font-bold uppercase tracking-wide text-on-surface-variant">RSVPs</h3>
        {rsvps.length === 0 ? (
          <FcCard className="p-4 text-sm text-on-surface-variant">No Click-account RSVPs yet.</FcCard>
        ) : (
          <div className="space-y-3">
            {rsvps.map((event) => (
              <EventListCard key={event.beacon_id} event={event} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
