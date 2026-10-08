"use client";

import { CircleSlash, Clock, CreditCard, RotateCcw, SearchX, type LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ds/Button";
import { EmptyState } from "@/components/ds/EmptyState";
import { Spinner } from "@/components/ds/Spinner";
import { eventPassPath, eventSharePath } from "@/lib/events/eventUrls";
import { TicketingError, fetchOrder, orderOutcome, type OrderOutcome } from "@/lib/ticketing/ticketingClient";

/** Poll fast while the webhook usually lands, then ease off; give up quietly after a minute. */
const FAST_MS = 1_000;
const FAST_FOR_MS = 10_000;
const SLOW_MS = 3_000;
const GIVE_UP_MS = 60_000;

type View = OrderOutcome | "not_found" | "timed_out";

const ENDINGS: Record<
  Exclude<View, "confirmed" | "pending">,
  { icon: LucideIcon; title: string; body: string; action: "Back to event" | "Try again" }
> = {
  canceled: { icon: CircleSlash, title: "No charge was made", body: "You left checkout before paying.", action: "Back to event" },
  failed: {
    icon: CreditCard,
    title: "Payment didn’t go through",
    body: "No charge was made. You can try again with another card.",
    action: "Try again",
  },
  expired: {
    icon: Clock,
    title: "Checkout timed out",
    body: "Your tickets were released and no charge was made.",
    action: "Try again",
  },
  refunded: {
    icon: RotateCcw,
    title: "Your payment was refunded",
    body: "We couldn’t issue these tickets, so the charge was reversed in full.",
    action: "Back to event",
  },
  not_found: {
    icon: SearchX,
    title: "We couldn’t find this order.",
    body: "Check that you’re logged in to the account you bought with.",
    action: "Back to event",
  },
  timed_out: {
    icon: Clock,
    title: "Still confirming…",
    body: "Your payment is still processing. Your tickets will show up on the event page as soon as it clears.",
    action: "Back to event",
  },
};

/**
 * Where Stripe Checkout sends the buyer back (spec §5.3). The redirect proves nothing: only the
 * webhook issues tickets, so this waits for the order to settle, then opens the tickets.
 */
export function CheckoutReturn({ beaconId, orderId, canceledParam }: { beaconId: string; orderId: string; canceledParam: boolean }) {
  const router = useRouter();
  // A new router identity must not restart polling (and its one-minute clock).
  const routerRef = useRef(router);
  useEffect(() => {
    routerRef.current = router;
  }, [router]);
  // Leaving checkout makes Stripe send `canceled=1`: say so at once, and check once in case it paid anyway.
  const [view, setView] = useState<View>(canceledParam ? "canceled" : "pending");

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    const startedAt = Date.now();

    const poll = async () => {
      let next: View = "pending";
      try {
        next = orderOutcome(await fetchOrder(orderId));
      } catch (e) {
        if (e instanceof TicketingError && e.status === 404) next = "not_found";
      }
      if (stopped) return;
      if (next === "confirmed") {
        routerRef.current.replace(eventPassPath(beaconId));
        return;
      }
      if (canceledParam && next === "pending") return;
      if (next !== "pending") {
        setView(next);
        return;
      }
      const elapsed = Date.now() - startedAt;
      if (elapsed >= GIVE_UP_MS) {
        setView("timed_out");
        return;
      }
      timer = setTimeout(() => void poll(), elapsed < FAST_FOR_MS ? FAST_MS : SLOW_MS);
    };

    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [beaconId, orderId, canceledParam]);

  if (view === "pending" || view === "confirmed") {
    return (
      <div className="flex flex-col items-center px-4 py-16 text-center" role="status">
        <Spinner size={28} className="text-accent" />
        <h1 className="type-title-3 mt-5 text-fg">{view === "confirmed" ? "You’re in" : "Confirming your order…"}</h1>
        <p className="type-body mt-1 max-w-[44ch] text-fg-secondary">This usually takes a few seconds.</p>
      </div>
    );
  }

  const ending = ENDINGS[view];
  return (
    <EmptyState
      icon={ending.icon}
      title={ending.title}
      body={ending.body}
      action={
        <Button href={eventSharePath(beaconId)} variant={ending.action === "Try again" ? "primary" : "secondary"}>
          {ending.action}
        </Button>
      }
    />
  );
}
