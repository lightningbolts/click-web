"use client";

import { CalendarX2, ChevronRight, Ticket } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { Button } from "@/components/ds/Button";
import { cardClassName } from "@/components/ds/Card";
import { InlineNotice } from "@/components/ds/InlineNotice";
import { Skeleton } from "@/components/ds/Skeleton";
import { QuantityStepper } from "@/components/events/tickets/QuantityStepper";
import { eventPassPath, eventSharePath } from "@/lib/events/eventUrls";
import { assignLocation } from "@/lib/navigation/assignLocation";
import { loginHref } from "@/lib/shell/appNav";
import { formatMoney } from "@/lib/ticketing/money";
import { clampSelection, ctaLabel, pickQuantity, selectionTotal, type Selection } from "@/lib/ticketing/selection";
import {
  TicketingError,
  fetchOfferings,
  offeringsUrl,
  startCheckout,
  ticketingErrorMessage,
} from "@/lib/ticketing/ticketingClient";
import type { EventTicketing, TicketOffering } from "@/lib/ticketing/types";

/** Refusals that mean our copy of the offerings is stale: refetch and re-clamp. */
const STALE_CODES = new Set([
  "insufficient_inventory",
  "price_changed",
  "sales_ended",
  "sales_not_open",
  "sales_not_started",
  "tier_inactive",
  "tier_not_found",
  "over_order_limit",
  "over_user_limit",
]);

const dayFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

function availabilityLabel(offering: TicketOffering): string | null {
  switch (offering.availability) {
    case "on_sale":
      return offering.remaining != null ? `${offering.remaining} left` : null;
    case "sold_out":
      return "Sold out";
    case "not_started":
      return offering.sales_start_at ? `On sale ${dayFormat.format(Date.parse(offering.sales_start_at))}` : "Not on sale yet";
    case "ended":
      return "Sales ended";
    case "paused":
      return "Sales paused";
  }
}

/** What the CTA says when nothing can be bought right now. */
function unavailableLabel(offerings: readonly TicketOffering[]): string {
  if (offerings.length === 0) return "Not on sale yet";
  if (offerings.every((o) => o.availability === "sold_out")) return "Sold out";
  const upcoming = offerings.find((o) => o.availability === "not_started");
  if (upcoming) return availabilityLabel(upcoming) ?? "Not on sale yet";
  if (offerings.some((o) => o.availability === "paused")) return "Sales paused";
  return "Sales ended";
}

function OfferingText({ offering }: { offering: TicketOffering }) {
  const status = availabilityLabel(offering);
  return (
    <div className="min-w-0 flex-1">
      <p className="type-body-strong truncate text-fg">{offering.name}</p>
      <p className="type-meta tabular text-fg-secondary">
        {formatMoney(offering.unit_amount, offering.currency)}
        {status ? (
          <>
            <span aria-hidden> · </span>
            <span className={offering.availability === "on_sale" ? "text-warning-text" : "text-fg-tertiary"}>{status}</span>
          </>
        ) : null}
      </p>
      {offering.description ? <p className="type-meta mt-0.5 line-clamp-2 text-fg-tertiary">{offering.description}</p> : null}
    </div>
  );
}

/**
 * Ticket selection on the event page (spec §5.2). Offerings come fresh from the API (the page
 * itself is cached); free orders are claimed instantly, paid orders continue on Stripe Checkout.
 * Nothing about price is decided here: the server recomputes every total.
 */
export function TicketPurchaseCard({
  beaconId,
  ticketing,
  myTicketCount,
  signedIn,
  initialOfferings,
}: {
  beaconId: string;
  ticketing: EventTicketing;
  myTicketCount: number;
  signedIn: boolean;
  initialOfferings?: TicketOffering[];
}) {
  const router = useRouter();
  const { data: offerings, mutate } = useSWR(ticketing.cancelled ? null : offeringsUrl(beaconId), fetchOfferings, {
    fallbackData: initialOfferings,
    revalidateOnFocus: true,
  });
  // Untouched → a sensible default; once the buyer steps, their picks win.
  const [picked, setPicked] = useState<Selection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inFlight = useRef(false);

  // Coming back from Stripe with the browser's Back button restores this page as it was left.
  useEffect(() => {
    const onShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      inFlight.current = false;
      setSubmitting(false);
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);

  const list = offerings ?? [];
  const only = list.length === 1 ? list[0]! : null;
  const fallback: Selection = only && myTicketCount === 0 ? { [only.id]: 1 } : {};
  const selection = clampSelection(picked ?? fallback, list);
  const summary = selectionTotal(selection, list);
  const currency = list[0]?.currency ?? ticketing.currency;
  const onSale = list.some((o) => o.availability === "on_sale" && o.max_quantity > 0);
  // Free and paid tickets check out separately; say so wherever both are offered.
  const mixed = list.some((o) => o.unit_amount === 0) && list.some((o) => o.unit_amount > 0);

  const setQuantity = (tierId: string, quantity: number) => {
    setError(null);
    setPicked(pickQuantity(selection, list, tierId, quantity));
  };

  const submit = async () => {
    if (inFlight.current || summary.count === 0) return;
    inFlight.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const items = Object.entries(selection).map(([ticket_tier_id, quantity]) => ({ ticket_tier_id, quantity }));
      const started = await startCheckout(beaconId, items);
      // Stay busy until the next page takes over.
      if (started.checkout_url) assignLocation(started.checkout_url);
      else router.push(eventPassPath(beaconId));
    } catch (e) {
      const failure = e instanceof TicketingError ? e : new TicketingError(0, "network");
      setError(ticketingErrorMessage(failure));
      if (failure.code && STALE_CODES.has(failure.code)) {
        const fresh = await mutate().catch(() => undefined);
        if (fresh) setPicked(clampSelection(selection, fresh));
      }
      inFlight.current = false;
      setSubmitting(false);
    }
  };

  const stepper = (offering: TicketOffering) =>
    signedIn ? (
      <QuantityStepper
        name={offering.name}
        value={selection[offering.id] ?? 0}
        max={offering.availability === "on_sale" ? offering.max_quantity : 0}
        disabled={submitting || offering.availability !== "on_sale"}
        onChange={(quantity) => setQuantity(offering.id, quantity)}
      />
    ) : null;

  return (
    <section aria-labelledby="tickets-heading" className={cardClassName({ className: "rounded-xl" })} data-testid="ticket-card">
      <h2 id="tickets-heading" className="type-meta mb-3 font-semibold text-fg-secondary">
        Tickets
      </h2>

      {ticketing.cancelled ? (
        <div className="flex items-center gap-3" aria-live="polite">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-sm bg-destructive-fill text-destructive">
            <CalendarX2 size={20} strokeWidth={1.75} aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="type-body-strong text-fg">This event was cancelled</p>
            <p className="type-meta text-fg-secondary">Paid tickets are refunded automatically.</p>
          </div>
        </div>
      ) : offerings == null ? (
        <div aria-hidden className="space-y-3">
          <Skeleton rounded="sm" className="h-10 w-full" />
          <Skeleton rounded="full" className="h-12 w-full" />
        </div>
      ) : (
        <>
          {only ? (
            <div className="flex items-center gap-3">
              <OfferingText offering={only} />
              {stepper(only)}
            </div>
          ) : list.length > 1 ? (
            <ul className="-my-1">
              {list.map((offering) => (
                <li
                  key={offering.id}
                  data-testid="ticket-row"
                  className="flex items-center gap-3 py-3 shadow-[inset_0_1px_0_var(--hairline)] first:shadow-none"
                >
                  <OfferingText offering={offering} />
                  {stepper(offering)}
                </li>
              ))}
              {mixed ? <li className="type-meta pb-1 text-fg-tertiary">Free and paid tickets are separate orders.</li> : null}
            </ul>
          ) : (
            <p className="type-meta text-fg-secondary">The host hasn’t put tickets on sale yet.</p>
          )}

          {summary.count > 0 ? (
            <dl className="type-meta tabular mt-4 space-y-1.5 rounded-lg bg-fill-subtle p-3 text-fg-secondary">
              {summary.lines.map((line) => (
                <div key={line.name} className="flex justify-between gap-3">
                  <dt className="min-w-0 truncate">
                    {line.quantity} × {line.name}
                  </dt>
                  <dd className="shrink-0">{formatMoney(line.amount, currency)}</dd>
                </div>
              ))}
              <div className="flex justify-between gap-3">
                <dt>Fees</dt>
                <dd>None</dd>
              </div>
              <div className="type-body-strong flex justify-between gap-3 border-t border-hairline pt-1.5 text-fg">
                <dt>Total</dt>
                <dd>{formatMoney(summary.total, currency)}</dd>
              </div>
            </dl>
          ) : null}

          {error ? (
            <InlineNotice variant="destructive" live className="mt-4">
              {error}
            </InlineNotice>
          ) : null}

          <div className="mt-4 flex flex-col">
            {!onSale ? (
              <Button variant="secondary" size="lg" fullWidth disabled data-testid="ticket-cta">
                {unavailableLabel(list)}
              </Button>
            ) : signedIn ? (
              <Button
                variant="primary"
                size="lg"
                fullWidth
                loading={submitting}
                disabled={summary.count === 0}
                onClick={() => void submit()}
                data-testid="ticket-cta"
              >
                {ctaLabel(summary, currency)}
              </Button>
            ) : (
              <Button href={loginHref(eventSharePath(beaconId))} variant="primary" size="lg" fullWidth data-testid="ticket-cta">
                Log in to get tickets
              </Button>
            )}
          </div>
        </>
      )}

      {myTicketCount > 0 ? (
        <Link
          href={eventPassPath(beaconId)}
          className="mt-3 flex items-center gap-3 rounded-lg bg-fill-subtle p-3 transition-colors duration-[var(--d-fast)] hover:bg-fill-strong"
        >
          <span className="flex size-11 shrink-0 items-center justify-center rounded-md bg-action text-on-action">
            <Ticket size={20} strokeWidth={2} aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="type-body-strong block text-fg">Your tickets</span>
            <span className="type-meta block text-fg-secondary">
              You have {myTicketCount} {myTicketCount === 1 ? "ticket" : "tickets"}
            </span>
          </span>
          <ChevronRight size={16} strokeWidth={2} aria-hidden className="shrink-0 text-fg-tertiary" />
        </Link>
      ) : null}
    </section>
  );
}
