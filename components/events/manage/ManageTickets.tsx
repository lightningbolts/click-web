"use client";

import { ScanLine, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";
import { Button } from "@/components/ds/Button";
import { useConfirm } from "@/components/ds/ConfirmDialog";
import { EmptyState } from "@/components/ds/EmptyState";
import { InlineNotice } from "@/components/ds/InlineNotice";
import { ListGroup, ListRow } from "@/components/ds/ListGroup";
import { SearchField } from "@/components/ds/SearchField";
import { StatTile } from "@/components/ds/StatTile";
import { toast } from "@/components/ds/Toast";
import { TicketAttendeeList } from "@/components/events/manage/TicketAttendeeList";
import type { EventAccess } from "@/lib/events/beaconManageAuth";
import { eventScanPath } from "@/lib/events/eventUrls";
import { formatAmount, formatMoney } from "@/lib/ticketing/money";
import { useDebounced } from "@/lib/ui/useDebounced";
import {
  TicketingError,
  attendeesUrl,
  cancelEvent,
  searchAttendees,
  ticketingErrorMessage,
} from "@/lib/ticketing/ticketingClient";
import type { TicketAttendee, TicketSalesSummary } from "@/lib/ticketing/types";

type Page = { attendees: TicketAttendee[]; next_cursor: string | null };

export const SEARCH_DELAY_MS = 250;

function cancelMessage(orders: number): string {
  if (orders === 0) return "Everyone’s tickets stop working right away.";
  if (orders === 1) return "Everyone’s tickets stop working and the 1 paid order is refunded in full.";
  return `Everyone’s tickets stop working and all ${orders} paid orders are refunded in full.`;
}

function cancelledToast({ refunds_started, refunds_failed }: { refunds_started: number; refunds_failed: number }): string {
  const started = `Event cancelled. ${refunds_started} ${refunds_started === 1 ? "refund" : "refunds"} started.`;
  return refunds_failed > 0 ? `${started} ${refunds_failed} will retry automatically.` : started;
}

/** The organizer's Tickets tab (spec §5.2): sales at a glance, who's coming, door and refund tools. */
export function ManageTickets({
  beaconId,
  access,
  summary,
  initialAttendees,
  cancelled,
  timeZone,
}: {
  beaconId: string;
  access: EventAccess;
  summary: TicketSalesSummary;
  initialAttendees: Page;
  cancelled: boolean;
  timeZone: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const q = useDebounced(query.trim(), SEARCH_DELAY_MS);
  const [confirm, confirmDialog] = useConfirm();
  const [cancelling, setCancelling] = useState(false);
  const readOnly = access !== "manage" || cancelled;

  // First page per search (the server rendered the unfiltered one); later pages append below it.
  const { data: first, error, isLoading } = useSWR<Page>(q ? attendeesUrl(beaconId, q) : null, searchAttendees, {
    revalidateOnFocus: false,
  });
  const head = q ? first : initialAttendees;
  const [later, setLater] = useState<{ q: string; pages: Page[] }>({ q: "", pages: [] });
  const pages = head ? [head, ...(later.q === q ? later.pages : [])] : [];
  const attendees = pages.flatMap((p) => p.attendees);
  const cursor = pages.at(-1)?.next_cursor ?? null;
  const [loadingMore, setLoadingMore] = useState(false);

  const showMore = async () => {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const page = await searchAttendees(attendeesUrl(beaconId, q, cursor));
      setLater((prev) => ({ q, pages: [...(prev.q === q ? prev.pages : []), page] }));
    } catch {
      toast.error("We couldn’t load more attendees. Try again.");
    } finally {
      setLoadingMore(false);
    }
  };

  const priceOf = (tierName: string) => {
    const tier = summary.tiers.find((t) => t.name === tierName);
    return tier && tier.unit_amount > 0 ? { cents: tier.unit_amount, currency: summary.currency } : null;
  };

  const cancel = async () => {
    const ok = await confirm({
      title: "Cancel this event?",
      message: cancelMessage(summary.refundable_orders),
      confirmLabel: "Cancel event",
      cancelLabel: "Keep event",
      destructive: true,
    });
    if (!ok) return;
    setCancelling(true);
    try {
      toast.success(cancelledToast(await cancelEvent(beaconId)));
      router.refresh();
    } catch (e) {
      toast.error(ticketingErrorMessage(e instanceof TicketingError ? e : new TicketingError(0, "network")));
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className="flex flex-col gap-8" data-testid="manage-tickets">
      {cancelled ? <InlineNotice variant="destructive">This event was cancelled. Paid orders are being refunded.</InlineNotice> : null}

      <section aria-label="Sales">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatTile label="Sold" value={`${summary.sold} / ${summary.capacity}`} />
          <StatTile label="Checked in" value={summary.checked_in} />
          <StatTile
            label="Gross"
            value={formatAmount(summary.gross_cents, summary.currency)}
            hint={summary.refunded_cents > 0 ? `${formatAmount(summary.refunded_cents, summary.currency)} refunded` : undefined}
          />
          <StatTile label="You receive" value={formatAmount(summary.net_cents, summary.currency)} />
        </div>
      </section>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 min-[900px]:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] min-[900px]:items-start">
        <div className="flex flex-col gap-4">
          <ListGroup header="Ticket types" aria-label="Ticket types">
            {summary.tiers.map((t) => (
              <ListRow
                key={t.id}
                title={t.name}
                subtitle={<span className="tabular">{formatMoney(t.unit_amount, summary.currency)}</span>}
                trailing={<span className="type-meta tabular text-fg-secondary">{`${t.sold} / ${t.capacity} sold`}</span>}
              />
            ))}
          </ListGroup>
          {cancelled ? null : (
            <Button href={eventScanPath(beaconId)} icon={ScanLine} fullWidth>
              Open scanner
            </Button>
          )}
        </div>

        <section aria-labelledby="ticket-attendees-heading">
          <h3 id="ticket-attendees-heading" className="type-meta mb-2 px-4 font-semibold text-fg-secondary">
            Attendees
          </h3>
          <SearchField
            label="Search attendees"
            placeholder="Name or ticket number"
            value={query}
            onValueChange={setQuery}
            className="mb-3"
          />
          {error && !attendees.length ? (
            <InlineNotice variant="warning">We couldn’t load attendees. Try again in a moment.</InlineNotice>
          ) : attendees.length ? (
            <TicketAttendeeList beaconId={beaconId} attendees={attendees} readOnly={readOnly} priceOf={priceOf} timeZone={timeZone} />
          ) : isLoading ? null : (
            <EmptyState
              icon={Search}
              title={q ? "No matches" : "No tickets yet"}
              body={q ? "Try a name or a ticket number like CLK-7Q2M." : "People who get tickets show up here."}
              headingLevel="h3"
              className="rounded-lg bg-surface dark:shadow-[inset_0_0_0_1px_var(--hairline)]"
            />
          )}
          {cursor ? (
            <div className="mt-3 flex justify-center">
              <Button size="sm" variant="plain" loading={loadingMore} onClick={() => void showMore()}>
                Show more
              </Button>
            </div>
          ) : null}
        </section>
      </div>

      {access === "manage" && !cancelled ? (
        <section aria-label="Cancel event" className="flex flex-col items-start gap-2 px-4">
          <Button variant="destructive" loading={cancelling} onClick={() => void cancel()}>
            Cancel event
          </Button>
          <p className="type-meta text-fg-tertiary">Every paid order is refunded to the buyer’s card. This can’t be undone.</p>
        </section>
      ) : null}
      {confirmDialog}
    </div>
  );
}
