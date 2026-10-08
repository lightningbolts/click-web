"use client";

import { Ticket } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";
import { Button } from "@/components/ds/Button";
import { EmptyState } from "@/components/ds/EmptyState";
import { EventRow, EventRowSkeleton } from "@/components/ds/EventRow";
import { InlineNotice } from "@/components/ds/InlineNotice";
import { SegmentedControl } from "@/components/ds/SegmentedControl";
import { eventDisplayTitle } from "@/lib/events/eventMetadata";
import { eventPassPath } from "@/lib/events/eventUrls";
import { formatEventWhen } from "@/lib/home/format";
import { fetchMyTickets } from "@/lib/ticketing/ticketingClient";
import type { MyTicketsGroup } from "@/lib/ticketing/types";

export type TicketScope = "upcoming" | "past";

/** "2 tickets · General, VIP": how many, and of which kinds, in the order they were issued. */
export function ticketSummary(group: MyTicketsGroup): string {
  const count = group.tickets.length;
  const tiers = [...new Set(group.tickets.map((t) => t.tier_name))].join(", ");
  return `${count} ${count === 1 ? "ticket" : "tickets"} · ${tiers}`;
}

/**
 * Your tickets across events (spec §5.5): one row per event, opening its tickets. Upcoming and
 * Past, with the choice kept in `?scope=` so Back and shared links land on the same list.
 */
export function TicketWallet({
  initialScope,
  initialGroups,
  timeZone,
}: {
  initialScope: TicketScope;
  /** The server's first page for `initialScope`, so the list paints without a round trip. */
  initialGroups?: MyTicketsGroup[];
  timeZone: string;
}) {
  const router = useRouter();
  const [scope, setScope] = useState<TicketScope>(initialScope);
  const [nowMs] = useState(() => Date.now());
  const { data, error, mutate } = useSWR(["my-tickets", scope], () => fetchMyTickets(scope), {
    fallbackData: scope === initialScope ? initialGroups : undefined,
  });

  const changeScope = (next: TicketScope) => {
    setScope(next);
    router.replace(next === "upcoming" ? "/tickets" : `/tickets?scope=${next}`, { scroll: false });
  };

  return (
    <>
      <SegmentedControl<TicketScope>
        label="Which tickets"
        value={scope}
        onChange={changeScope}
        segments={[
          { value: "upcoming", label: "Upcoming" },
          { value: "past", label: "Past" },
        ]}
        className="mb-5"
      />
      {data ? (
        data.length ? (
          <ul className="space-y-3">
            {data.map((group) => (
              <li key={group.event.beacon_id}>
                <EventRow
                  href={eventPassPath(group.event.beacon_id)}
                  id={group.event.visual_seed || group.event.beacon_id}
                  title={eventDisplayTitle(group.event.title, group.event.location_name)}
                  timeLabel={formatEventWhen(group.event.start_at, timeZone, nowMs)}
                  location={group.event.location_name}
                  photoUrl={group.event.image_url}
                  detail={ticketSummary(group)}
                  pills={group.event.cancelled ? [{ label: "Cancelled", variant: "destructive" }] : undefined}
                  headingLevel="h2"
                />
              </li>
            ))}
          </ul>
        ) : scope === "upcoming" ? (
          <EmptyState
            icon={Ticket}
            title="No upcoming tickets"
            body="Tickets you get for events show up here, ready for the door."
            action={
              <Button variant="primary" href="/events">
                Browse events
              </Button>
            }
          />
        ) : (
          <EmptyState icon={Ticket} title="No past tickets" body="Events you had tickets for move here once they’re over." />
        )
      ) : error ? (
        <InlineNotice
          variant="destructive"
          action={
            <Button size="sm" variant="plain" onClick={() => void mutate()}>
              Retry
            </Button>
          }
        >
          Couldn’t load your tickets.
        </InlineNotice>
      ) : (
        <div className="space-y-3" aria-hidden>
          <EventRowSkeleton />
          <EventRowSkeleton />
        </div>
      )}
    </>
  );
}
