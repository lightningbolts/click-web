"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { FcButton } from "@/components/fc";
import { ticketingApi } from "@/lib/ticketing/api";
import { ticketingError } from "@/lib/ticketing/errors";
export default function ConnectReturn({
  returnTo,
  refresh,
}: {
  returnTo: string;
  refresh: boolean;
}) {
  const [message, setMessage] = useState("Checking payout setup…"),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let stopped = false;
    async function run() {
      try {
        if (refresh) {
          const d = await ticketingApi<{ onboarding_url: string }>(
            "/api/payments/connect/onboarding",
            { return_to: returnTo },
          );
          if (!stopped) window.location.assign(d.onboarding_url);
        } else {
          const d = await ticketingApi<{ can_sell: boolean }>(
            "/api/payments/connect/status?sync=1",
          );
          if (!stopped)
            setMessage(
              d.can_sell
                ? "Payout setup is ready."
                : "Payout setup still needs attention. Return to event management to continue.",
            );
        }
      } catch (e) {
        if (!stopped) setMessage(ticketingError(e));
      }
    }
    void run();
    return () => {
      stopped = true;
    };
  }, [refresh, returnTo, retry]);
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-bold">Organizer payouts</h1>
      <p role="status">{message}</p>
      <FcButton onClick={() => setRetry((n) => n + 1)}>Check again</FcButton>
      <p>
        <Link href={returnTo}>Continue</Link>
      </p>
    </section>
  );
}
