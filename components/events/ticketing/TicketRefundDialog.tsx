"use client";
import { useEffect, useRef, useState } from "react";
import { FcButton, FcField, FcTextarea } from "@/components/fc";
import { ticketingApi } from "@/lib/ticketing/api";
import { ticketingError } from "@/lib/ticketing/errors";
import { money } from "@/lib/ticketing/format";
import type { TicketOrder } from "@/lib/ticketing/types";
export default function TicketRefundDialog({
  order,
  onClose,
  onSaved,
}: {
  order: TicketOrder;
  onClose: () => void;
  onSaved: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    request = useRef<{ key: string; id: string } | null>(null);
  const [selected, setSelected] = useState<string[]>([]),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.showModal();
    return () => previous?.focus();
  }, []);
  const claimed = new Set(
    order.ticket_refunds?.filter((r) => r.status === "pending").flatMap((r) => r.ticket_ids),
  );
  const tickets = (order.tickets ?? []).filter(
    (t) => ["valid", "checked_in"].includes(t.status) && !claimed.has(t.id),
  );
  const amount = tickets
    .filter((t) => selected.includes(t.id))
    .reduce(
      (n, t) =>
        n +
        (order.ticket_order_items?.find((i) => i.ticket_tier_id === t.ticket_tier_id)
          ?.unit_amount ?? 0),
      0,
    );
  return (
    <dialog
      ref={ref}
      aria-labelledby="refund-title"
      onCancel={(e) => {
        if (busy) e.preventDefault();
        else onClose();
      }}
      className="max-h-[90vh] w-full max-w-lg overflow-auto border-2 border-border-hard bg-surface p-6 text-on-surface"
    >
      <h2 id="refund-title" className="text-xl font-bold">
        Refund tickets
      </h2>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            const key = JSON.stringify([selected.slice().sort(), reason]);
            if (request.current?.key !== key) request.current = { key, id: crypto.randomUUID() };
            await ticketingApi("/api/orders/" + order.id + "/refunds", {
              request_id: request.current.id,
              ticket_ids: selected,
              reason: reason || null,
            });
            onSaved();
            onClose();
          } catch (e) {
            setError(ticketingError(e));
            setBusy(false);
          }
        }}
      >
        <FcButton
          variant="secondary"
          disabled={busy}
          onClick={() => setSelected(tickets.map((t) => t.id))}
        >
          Select all refundable tickets
        </FcButton>
        {tickets.map((t) => (
          <label key={t.id} className="flex min-h-11 items-center gap-3">
            <input
              type="checkbox"
              disabled={busy}
              checked={selected.includes(t.id)}
              onChange={(e) =>
                setSelected((ids) =>
                  e.target.checked ? [...ids, t.id] : ids.filter((id) => id !== t.id),
                )
              }
            />
            {t.ticket_number} · {t.status}
          </label>
        ))}
        <FcField label="Reason (optional)">
          <FcTextarea
            disabled={busy}
            value={reason}
            maxLength={500}
            onChange={(e) => setReason(e.target.value)}
          />
        </FcField>
        <p>
          Refund amount: <strong>{money(amount, order.currency)}</strong>. The selected tickets
          become unusable when Stripe confirms the refund.
        </p>
        {error ? <p role="alert">{error}</p> : null}
        <FcButton disabled={busy || !selected.length} type="submit">
          {busy ? "Submitting…" : "Confirm refund"}
        </FcButton>
        <FcButton disabled={busy} variant="secondary" onClick={onClose}>
          Cancel
        </FcButton>
      </form>
    </dialog>
  );
}
