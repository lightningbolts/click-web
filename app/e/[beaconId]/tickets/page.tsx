import { ticketingEnabled } from "@/lib/server/ticketing/flags";
import TicketWallet from "@/components/events/ticketing/TicketWallet";
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
  void searchParams;
  return (
    <EventPageShell className="py-10">
      {ticketingEnabled() ? <TicketWallet beaconId={beaconId} /> : <p>Ticketing is not enabled.</p>}
    </EventPageShell>
  );
}
