import { ticketingEnabled } from "@/lib/server/ticketing/flags";
import { safeTicketingReturnTo } from "@/lib/ticketing/returnTo";
import ConnectReturn from "@/components/events/ticketing/ConnectReturn";
import EventPageShell from "@/components/events/EventPageShell";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ return_to?: string }>;
}) {
  const q = await searchParams;
  return (
    <EventPageShell className="py-10">
      {ticketingEnabled() ? (
        <ConnectReturn refresh={false} returnTo={safeTicketingReturnTo(q.return_to)} />
      ) : (
        <p>Ticketing is not enabled.</p>
      )}
    </EventPageShell>
  );
}
