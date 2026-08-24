import Link from "next/link";
import { createAdminSupabaseClient } from "@/lib/server/admin/supabaseAdmin";
import { loadPublicUpcomingEvents } from "@/lib/events/publicEvent";
import { FcButton, FcCard, FcPageShell, FcSectionHeader } from "@/components/fc";
import { EventListCard } from "@/components/events/EventListCard";

// Request-time only: listing uses the service-role client, which is optional
// for `next build` (see .env.example) and present on the Worker at runtime.
export const dynamic = "force-dynamic";

export default async function PublicEventsPage() {
  const admin = createAdminSupabaseClient();
  const events = await loadPublicUpcomingEvents(admin);

  return (
    <FcPageShell className="px-4 py-10 md:px-8">
      <div className="mx-auto w-full max-w-5xl">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <FcSectionHeader
            className="mb-0"
            title="Events"
            subtitle="Public gatherings you can open without an account."
          />
          <Link href="/events/new">
            <FcButton type="button">Create event</FcButton>
          </Link>
        </div>
        {events.length === 0 ? (
          <FcCard className="px-6 py-12 text-center">
            <h2 className="text-lg font-bold text-on-surface">No public events yet</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-on-surface-variant">
              Host a picnic, study session, or neighborhood meetup. Anyone with the link can RSVP.
            </p>
            <Link href="/events/new" className="mt-5 inline-flex">
              <FcButton type="button">Create the first event</FcButton>
            </Link>
          </FcCard>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {events.map((event) => (
              <EventListCard key={event.beacon_id} event={event} />
            ))}
          </div>
        )}
      </div>
    </FcPageShell>
  );
}
