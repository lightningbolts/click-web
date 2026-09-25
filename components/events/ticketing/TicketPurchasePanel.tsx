"use client";
import { useRef, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import LoginModal from "@/components/LoginModal";
import { FcButton } from "@/components/fc";
import { useAuth } from "@/lib/AuthContext";
import { ticketingApi } from "@/lib/ticketing/api";
import { money, salesLabel } from "@/lib/ticketing/format";
import { ticketingError } from "@/lib/ticketing/errors";
import type { TierResponse, TicketingEvent } from "@/lib/ticketing/types";
import TicketCheckoutSummary from "./TicketCheckoutSummary";
export default function TicketPurchasePanel({
  beaconId,
  initial,
  enabled,
}: {
  beaconId: string;
  initial: TicketingEvent;
  enabled: boolean;
}) {
  const { user } = useAuth();
  const [loginOpen, setLoginOpen] = useState(false);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const attempt = useRef<{ key: string; id: string } | null>(null);
  const {
    data,
    error: loadError,
    mutate,
  } = useSWR<TierResponse>(
    enabled ? "/api/beacons/" + beaconId + "/tickets/tiers" : null,
    ticketingApi,
  );
  const event = data?.event ?? initial;
  const label = salesLabel(
    event.ticketing_status,
    event.ticket_sales_start_at,
    event.ticket_sales_end_at,
  );
  const tiers = data?.tiers ?? [];
  async function checkout() {
    setBusy(true);
    setError("");
    try {
      const items = tiers
        .filter((t) => quantities[t.id] > 0)
        .map((t) => ({ ticket_tier_id: t.id, quantity: quantities[t.id] }));
      const key = JSON.stringify(items);
      const storageKey = "click-ticket-attempt:" + beaconId + ":" + user?.id;
      try {
        const stored = JSON.parse(sessionStorage.getItem(storageKey) ?? "null");
        if (stored?.key === key && typeof stored.id === "string") attempt.current = stored;
      } catch {
        /* Storage is optional; the current mounted attempt is still stable. */
      }
      if (attempt.current?.key !== key) attempt.current = { key, id: crypto.randomUUID() };
      try {
        sessionStorage.setItem(storageKey, JSON.stringify(attempt.current));
      } catch {
        /* Private browsing may disable storage. */
      }
      const result = await ticketingApi<{ checkout_url: string }>(
        "/api/beacons/" + beaconId + "/tickets/checkout",
        { attempt_id: attempt.current.id, items },
      );
      window.location.assign(result.checkout_url);
    } catch (e) {
      setError(ticketingError(e));
      await mutate();
    } finally {
      setBusy(false);
    }
  }
  if (!enabled) return <p>Ticket sales are not available yet.</p>;
  return (
    <section aria-label="Buy tickets" className="space-y-4">
      <h2 className="text-xl font-bold">{label}</h2>
      {loadError ? (
        <p role="alert">
          {ticketingError(loadError)} <FcButton onClick={() => mutate()}>Retry</FcButton>
        </p>
      ) : !data ? (
        <p role="status">Loading tickets…</p>
      ) : null}
      {tiers.map((t) => {
        const scheduled =
          (t.sales_start_at && Date.parse(t.sales_start_at) > Date.now()) ||
          (t.sales_end_at && Date.parse(t.sales_end_at) <= Date.now());
        const maximum = Math.min(t.max_per_order, t.max_per_user ?? 20, t.remaining);
        return (
          <fieldset
            key={t.id}
            disabled={busy || label !== "Tickets available" || !!scheduled}
            className="border-2 border-border-hard p-3"
          >
            <legend className="font-bold">
              {t.name} · {money(t.unit_amount, t.currency)}
            </legend>
            <p>{t.description}</p>
            <p>
              {t.remaining === 0
                ? "Sold out"
                : scheduled
                  ? "Outside sales window"
                  : t.remaining + " remaining"}
            </p>
            <div className="flex items-center gap-3">
              <FcButton
                aria-label={"Remove one " + t.name + " ticket"}
                disabled={!quantities[t.id] || busy}
                onClick={() =>
                  setQuantities((q) => ({ ...q, [t.id]: Math.max(0, (q[t.id] ?? 0) - 1) }))
                }
              >
                −
              </FcButton>
              <output aria-label={t.name + " quantity"}>{quantities[t.id] ?? 0}</output>
              <FcButton
                aria-label={"Add one " + t.name + " ticket"}
                disabled={(quantities[t.id] ?? 0) >= maximum || busy}
                onClick={() => setQuantities((q) => ({ ...q, [t.id]: (q[t.id] ?? 0) + 1 }))}
              >
                +
              </FcButton>
            </div>
          </fieldset>
        );
      })}
      {!tiers.length && data ? <p>No tickets are available.</p> : null}
      <TicketCheckoutSummary tiers={tiers} quantities={quantities} />
      {error ? <p role="alert">{error}</p> : null}
      {user ? (
        <FcButton
          disabled={
            busy || label !== "Tickets available" || !tiers.some((t) => quantities[t.id] > 0)
          }
          onClick={checkout}
        >
          {busy ? "Opening checkout…" : "Continue to checkout"}
        </FcButton>
      ) : (
        <>
          <FcButton onClick={() => setLoginOpen(true)}>Sign in to buy tickets</FcButton>
          <LoginModal
            isOpen={loginOpen}
            onClose={() => setLoginOpen(false)}
            nextPath={"/e/" + beaconId}
          />
        </>
      )}
      <p>
        <Link href={"/e/" + beaconId + "/tickets"}>My tickets</Link>
      </p>
    </section>
  );
}
