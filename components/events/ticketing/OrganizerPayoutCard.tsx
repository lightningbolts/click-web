"use client";
import { useState } from "react";
import useSWR from "swr";
import { FcButton, FcCard } from "@/components/fc";
import { ticketingApi } from "@/lib/ticketing/api";
import { ticketingError } from "@/lib/ticketing/errors";
export default function OrganizerPayoutCard({ beaconId }: { beaconId: string }) {
  const { data, error, mutate } = useSWR<{ onboarding_state: string; can_sell: boolean }>(
    "/api/payments/connect/status",
    ticketingApi,
  );
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  async function start() {
    setBusy(true);
    try {
      const d = await ticketingApi<{ onboarding_url: string }>("/api/payments/connect/onboarding", {
        return_to: "/e/" + beaconId + "/manage#ticketing",
      });
      window.location.assign(d.onboarding_url);
    } catch (e) {
      setMessage(ticketingError(e));
      setBusy(false);
    }
  }
  return (
    <FcCard className="space-y-3 p-4">
      <h3 className="font-bold">Organizer payouts</h3>
      <p role="status">
        {data?.can_sell
          ? "Ready to receive ticket payments"
          : (data?.onboarding_state.replaceAll("_", " ") ?? "Checking payout setup…")}
      </p>
      {error || message ? <p role="alert">{message || ticketingError(error)}</p> : null}
      <FcButton disabled={busy} onClick={start}>
        {busy ? "Opening…" : data?.can_sell ? "Review payout setup" : "Set up payouts"}
      </FcButton>
      <FcButton variant="secondary" onClick={() => mutate()}>
        Refresh
      </FcButton>
    </FcCard>
  );
}
