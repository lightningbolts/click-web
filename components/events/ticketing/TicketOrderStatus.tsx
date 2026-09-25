"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ticketingApi } from "@/lib/ticketing/api";
import { ticketingError } from "@/lib/ticketing/errors";
import type { TicketOrder } from "@/lib/ticketing/types";
import { FcButton } from "@/components/fc";
export default function TicketOrderStatus({
  beaconId,
  orderId,
}: {
  beaconId: string;
  orderId: string;
}) {
  const [order, setOrder] = useState<TicketOrder | null>(null),
    [error, setError] = useState(""),
    [timedOut, setTimedOut] = useState(false),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let count = 0;
    async function poll() {
      try {
        const data = await ticketingApi<{ order: TicketOrder }>(
          "/api/orders/" + orderId,
          undefined,
          "GET",
          controller.signal,
        );
        if (controller.signal.aborted) return;
        if (data.order.beacon_id !== beaconId) throw new Error("Order not found");
        setOrder(data.order);
        setError("");
        if (
          [
            "paid",
            "partially_refunded",
            "refunded",
            "expired",
            "canceled",
            "payment_failed",
            "disputed",
          ].includes(data.order.order_state)
        )
          return;
      } catch (e) {
        if (controller.signal.aborted) return;
        setError(ticketingError(e));
      }
      if (++count >= 18) {
        setTimedOut(true);
        return;
      }
      timer = setTimeout(poll, Math.min(1500 * Math.pow(1.3, count), 10000));
    }
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [beaconId, orderId, retry]);
  const confirmed =
    order?.fulfillment_state === "fulfilled" &&
    ["paid", "partially_refunded"].includes(order.order_state);
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-bold">Ticket order</h1>
      <p role="status">
        {confirmed
          ? "Payment confirmed. Your tickets are ready."
          : order &&
              ["expired", "canceled", "payment_failed", "refunded", "disputed"].includes(
                order.order_state,
              )
            ? "Order " + order.order_state.replaceAll("_", " ")
            : "Waiting for payment confirmation…"}
      </p>
      {error ? <p role="alert">{error}</p> : null}
      {timedOut ? (
        <>
          <p>Confirmation is taking longer. Your order remains saved.</p>
          <FcButton
            onClick={() => {
              setTimedOut(false);
              setRetry((v) => v + 1);
            }}
          >
            Check again
          </FcButton>
        </>
      ) : null}
      <Link href={"/e/" + beaconId + "/tickets"}>View my tickets</Link>
      <p>
        <Link href={"/e/" + beaconId}>Return to event</Link>
      </p>
    </section>
  );
}
