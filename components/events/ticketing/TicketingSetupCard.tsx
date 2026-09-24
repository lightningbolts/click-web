"use client";
import useSWR from "swr";
import Link from "next/link";
import { FcCard, FcButton } from "@/components/fc";
import { ticketingApi } from "@/lib/ticketing/api";
import { ticketingError } from "@/lib/ticketing/errors";
import type { TierResponse } from "@/lib/ticketing/types";
import TicketingGate from "./TicketingGate";
import OrganizerPayoutCard from "./OrganizerPayoutCard";
import TicketTierEditor from "./TicketTierEditor";
import TicketSalesControls from "./TicketSalesControls";
import TicketSalesDashboard from "./TicketSalesDashboard";
function Setup({ beaconId }: { beaconId: string }) {
  const { data, error, mutate } = useSWR<TierResponse>(
    "/api/beacons/" + beaconId + "/tickets/tiers?view=organizer",
    ticketingApi,
  );
  return (
    <FcCard id="ticketing" className="space-y-6 p-5">
      <h2 className="text-2xl font-bold">Ticketing</h2>
      {error ? (
        <p role="alert">
          {ticketingError(error)} <FcButton onClick={() => mutate()}>Retry</FcButton>
        </p>
      ) : !data ? (
        <p role="status">Loading ticketing…</p>
      ) : (
        <>
          {data.can_refund ? (
            <OrganizerPayoutCard beaconId={beaconId} />
          ) : (
            <p>The event creator controls payouts and refunds.</p>
          )}
          <TicketTierEditor beaconId={beaconId} tiers={data.tiers} refresh={() => mutate()} />
          {data.can_refund ? (
            <TicketSalesControls beaconId={beaconId} event={data.event} refresh={() => mutate()} />
          ) : null}
          <Link href={"/e/" + beaconId + "/manage/check-in"}>Open ticket check-in</Link>
          <TicketSalesDashboard beaconId={beaconId} canRefund={data.can_refund} />
        </>
      )}
    </FcCard>
  );
}
export default function TicketingSetupCard(props: { beaconId: string }) {
  return (
    <TicketingGate>
      <Setup {...props} />
    </TicketingGate>
  );
}
