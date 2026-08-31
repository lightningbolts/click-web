"use client";

import Link from "next/link";
import { useAuth } from "@/lib/AuthContext";
import DashboardEventsModule from "@/components/dashboard/DashboardEventsModule";
import PublicEventList from "@/components/events/PublicEventList";
import EventPageShell from "@/components/events/EventPageShell";
import { FcButton, FcCard, FcSectionHeader } from "@/components/fc";
import type { EventListItem } from "@/components/events/EventListCard";

export default function EventsPageBody({
  upcomingEvents,
  pastEvents,
}: {
  upcomingEvents: EventListItem[];
  pastEvents: EventListItem[];
}) {
  const { user } = useAuth();
  const emptyPublic = upcomingEvents.length === 0 && pastEvents.length === 0;

  return (
    <EventPageShell className="py-10">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <FcSectionHeader
          className="mb-0"
          title="Events"
          subtitle={
            user
              ? "Events you host or attend, plus public gatherings you can join."
              : "Public gatherings you can open without an account."
          }
        />
        <Link href="/events/new" className="inline-flex">
          <FcButton type="button">Create event</FcButton>
        </Link>
      </div>

      {user ? (
        <div className="mb-12">
          <DashboardEventsModule />
        </div>
      ) : null}

      {user ? (
        <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-on-surface-variant">
          Discover
        </h2>
      ) : null}

      {emptyPublic ? (
        <FcCard className="px-6 py-12 text-center">
          <h2 className="text-lg font-bold text-on-surface">No public events yet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-on-surface-variant">
            Host a picnic, study session, or neighborhood meetup. Anyone with the link can RSVP.
          </p>
          <Link href="/events/new" className="mt-5 inline-flex">
            <FcButton type="button">Create the first event</FcButton>
          </Link>
        </FcCard>
      ) : (
        <PublicEventList upcomingEvents={upcomingEvents} pastEvents={pastEvents} />
      )}
    </EventPageShell>
  );
}
