import { ticketingEnabled } from "@/lib/server/ticketing/flags";
import TicketCheckInScanner from "@/components/events/ticketing/TicketCheckInScanner";
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
      {ticketingEnabled() ? (
        <TicketCheckInScanner beaconId={beaconId} />
      ) : (
        <p>Ticketing is not enabled.</p>
      )}
    </EventPageShell>
  );
}
