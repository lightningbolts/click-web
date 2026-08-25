"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import useSWR from "swr";
import { FcButton, FcCard, FcSectionHeader } from "@/components/fc";
import { EventListCard, type EventListItem } from "@/components/events/EventListCard";
import { getFreshAuthHeaders } from "@/lib/auth/freshAuthHeaders";
import { fadePresence, fadeTransition } from "@/lib/motion";

export const MINE_EVENTS_KEY = "/api/beacons/mine";

export async function fetchMineEvents(url: string) {
  const headers = await getFreshAuthHeaders();
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error("Could not load your events.");
  return res.json() as Promise<{ events?: Array<EventListItem & { role?: string }> }>;
}

export default function DashboardEventsModule() {
  const reduceMotion = useReducedMotion();
  const { data, error, isLoading } = useSWR(MINE_EVENTS_KEY, fetchMineEvents, {
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
  });
  const events = data?.events ?? [];

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
      {error ? <p className="text-error">Could not load your events.</p> : null}
      {isLoading && events.length === 0 ? (
        <p className="text-sm text-on-surface-variant">Loading your events…</p>
      ) : null}
      <section className="space-y-3">
        <h3 className="text-sm font-bold uppercase tracking-wide text-on-surface-variant">My events</h3>
        {created.length === 0 && !isLoading ? (
          <FcCard className="space-y-3 p-6">
            <p className="text-sm text-on-surface-variant">You have not created an event yet.</p>
            <Link href="/events/new" className="inline-flex">
              <FcButton type="button">Create event</FcButton>
            </Link>
          </FcCard>
        ) : (
          <div className="space-y-3">
            {created.map((event) => (
              <motion.div
                key={event.beacon_id}
                {...(reduceMotion ? {} : fadePresence)}
                transition={fadeTransition(0.16)}
              >
                <EventListCard event={event} />
              </motion.div>
            ))}
          </div>
        )}
      </section>
      <section className="space-y-3">
        <h3 className="text-sm font-bold uppercase tracking-wide text-on-surface-variant">RSVPs</h3>
        {rsvps.length === 0 && !isLoading ? (
          <FcCard className="p-4 text-sm text-on-surface-variant">No Click-account RSVPs yet.</FcCard>
        ) : (
          <div className="space-y-3">
            {rsvps.map((event) => (
              <motion.div
                key={event.beacon_id}
                {...(reduceMotion ? {} : fadePresence)}
                transition={fadeTransition(0.16)}
              >
                <EventListCard event={event} />
              </motion.div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
