"use client";
import { useState } from "react";
import { FcButton, FcCard } from "@/components/fc";
import type { TicketOrder } from "@/lib/ticketing/types";
import { money } from "@/lib/ticketing/format";
import TicketRefundDialog from "./TicketRefundDialog";
export default function TicketOrderDrawer({
  order,
  canRefund,
  refresh,
}: {
  order: TicketOrder;
  canRefund: boolean;
  refresh: () => void;
}) {
  const [refund, setRefund] = useState(false),
    [submitted, setSubmitted] = useState(false);
  return (
    <FcCard className="p-4">
      <details>
        <summary className="min-h-11 cursor-pointer">
          {order.buyer?.name ?? "Attendee"} · {money(order.total_amount, order.currency)} ·{" "}
          {order.order_state.replaceAll("_", " ")}
        </summary>
        <p>Order {order.id}</p>
        <ul>
          {order.ticket_order_items?.map((i) => (
            <li key={i.ticket_tier_id}>
              {i.quantity} × {i.tier_name_snapshot} · {money(i.unit_amount, order.currency)} each
            </li>
          ))}
        </ul>
        <ul>
          {order.tickets?.map((t) => (
            <li key={t.id}>
              {t.ticket_number} · {t.status}
            </li>
          ))}
        </ul>
        {canRefund && ["paid", "partially_refunded"].includes(order.order_state) ? (
          <FcButton onClick={() => setRefund(true)}>Refund tickets</FcButton>
        ) : null}
        {order.ticket_refunds?.map((r) => (
          <p key={r.id}>
            Refund {money(r.amount, order.currency)} · {r.status}
          </p>
        ))}
        {submitted ? <p role="status">Refund submitted. Refresh to check confirmation.</p> : null}
      </details>
      {refund ? (
        <TicketRefundDialog
          order={order}
          onClose={() => setRefund(false)}
          onSaved={() => {
            setSubmitted(true);
            refresh();
          }}
        />
      ) : null}
    </FcCard>
  );
}
