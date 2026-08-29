"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import useSWR from "swr";
import { FcCard } from "@/components/fc";
import { EventListCard, type EventListItem } from "@/components/events/EventListCard";
import { getFreshAuthHeaders } from "@/lib/auth/freshAuthHeaders";
import { eventIsPast } from "@/lib/events/eventMetadata";
import { fadePresence, fadeTransition } from "@/lib/motion";

export const MINE_EVENTS_KEY = "/api/beacons/mine";

export async function fetchMineEvents(url: string) {
  const headers = await getFreshAuthHeaders();
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error("Could not load your events.");
  return res.json() as Promise<{ events?: Array<EventListItem & { role?: string }> }>;
}

function EventCardList({
  events,
  past,
}: {
  events: Array<EventListItem & { role?: string }>;
  past?: boolean;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {events.map((event) => (
        <motion.div
          key={event.beacon_id}
          {...(reduceMotion ? {} : fadePresence)}
          transition={fadeTransition(0.16)}
        >
          <EventListCard event={event} past={past} dense />
        </motion.div>
      ))}
    </div>
  );
}

export default function DashboardEventsModule() {
  const { data, error, isLoading } = useSWR(MINE_EVENTS_KEY, fetchMineEvents, {
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
  });
  const events = data?.events ?? [];

  const upcomingHosted = events.filter((e) => e.role === "creator" && !eventIsPast(e));
  const upcomingAttending = events.filter((e) => e.role !== "creator" && !eventIsPast(e));
  const pastHosted = events.filter((e) => e.role === "creator" && eventIsPast(e));
  const pastAttended = events.filter((e) => e.role !== "creator" && eventIsPast(e));

  return (
    <div className="space-y-8" data-testid="dashboard-events-module">
      {error ? <p className="text-error">Could not load your events.</p> : null}
      {isLoading && events.length === 0 ? (
        <p className="text-sm text-on-surface-variant">Loading your events…</p>
      ) : null}

      <section className="space-y-3">
        <h3 className="text-sm font-bold uppercase tracking-wide text-on-surface-variant">Upcoming</h3>
        <div className="space-y-6">
          <div className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Hosted</h4>
            {upcomingHosted.length === 0 && !isLoading ? (
              <FcCard className="space-y-3 p-6">
                <p className="text-sm text-on-surface-variant">You have not created an event yet.</p>
                <Link href="/events/new" className="fc-btn-primary inline-flex px-4 py-2">
                  Create event
                </Link>
              </FcCard>
            ) : (
              <EventCardList events={upcomingHosted} />
            )}
          </div>
          <div className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Attending</h4>
            {upcomingAttending.length === 0 && !isLoading ? (
              <FcCard className="p-4 text-sm text-on-surface-variant">No Click-account RSVPs yet.</FcCard>
            ) : (
              <EventCardList events={upcomingAttending} />
            )}
          </div>
        </div>
      </section>

      {(pastHosted.length > 0 || pastAttended.length > 0) ? (
        <section className="space-y-3">
          <h3 className="text-sm font-bold uppercase tracking-wide text-on-surface-variant">Past</h3>
          <div className="space-y-6">
            {pastHosted.length > 0 ? (
              <div className="space-y-3">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Hosted</h4>
                <EventCardList events={pastHosted} past />
              </div>
            ) : null}
            {pastAttended.length > 0 ? (
              <div className="space-y-3">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Attended</h4>
                <EventCardList events={pastAttended} past />
              </div>
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}
