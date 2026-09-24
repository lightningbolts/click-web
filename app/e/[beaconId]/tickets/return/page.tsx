import { ticketingEnabled } from "@/lib/server/ticketing/flags";
import TicketOrderStatus from "@/components/events/ticketing/TicketOrderStatus";
import EventPageShell from "@/components/events/EventPageShell";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ beaconId: string }>;
  searchParams: Promise<{ order?: string }>;
}) {
  const { beaconId } = await params;
  const query = await searchParams;
  return (
    <EventPageShell className="py-10">
      {ticketingEnabled() ? (
        <TicketOrderStatus beaconId={beaconId} orderId={query.order ?? ""} />
      ) : (
        <p>Ticketing is not enabled.</p>
      )}
    </EventPageShell>
  );
}
