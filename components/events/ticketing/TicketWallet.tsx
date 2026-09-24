"use client";
import useSWR from "swr";
import Link from "next/link";
import { ticketingApi } from "@/lib/ticketing/api";
import { ticketingError } from "@/lib/ticketing/errors";
import type { Ticket } from "@/lib/ticketing/types";
import TicketQrCard from "./TicketQrCard";
import { FcButton } from "@/components/fc";
export default function TicketWallet({ beaconId }: { beaconId: string }) {
  const { data, error, mutate } = useSWR<{ tickets: Ticket[] }>(
    "/api/beacons/" + beaconId + "/tickets",
    ticketingApi,
  );
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-bold">My tickets</h1>
      {error ? (
        <p role="alert">
          {ticketingError(error)} <FcButton onClick={() => mutate()}>Retry</FcButton>
        </p>
      ) : !data ? (
        <p role="status">Loading tickets…</p>
      ) : data.tickets.length ? (
        data.tickets.map((t) => <TicketQrCard key={t.id} beaconId={beaconId} ticket={t} />)
      ) : (
        <p>You do not have tickets for this event.</p>
      )}
      <Link href={"/e/" + beaconId}>Return to event</Link>
    </section>
  );
}
