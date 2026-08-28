import Link from "next/link";
import { unstable_cache } from "next/cache";
import { createAdminSupabaseClient } from "@/lib/server/admin/supabaseAdmin";
import { loadPublicUpcomingEvents } from "@/lib/events/publicEvent";
import { FcButton, FcCard, FcSectionHeader } from "@/components/fc";
import PublicEventList from "@/components/events/PublicEventList";
import EventPageShell from "@/components/events/EventPageShell";

// Request-time only: listing uses the service-role client, which is optional
// for `next build` (see .env.example) and present on the Worker at runtime.
export const dynamic = "force-dynamic";

const loadUpcoming = () =>
  unstable_cache(
    async () => loadPublicUpcomingEvents(createAdminSupabaseClient()),
    ["public-upcoming-events-v1"],
    { revalidate: 60 },
  )();

export default async function PublicEventsPage() {
  let events: Awaited<ReturnType<typeof loadPublicUpcomingEvents>> = [];
  try {
    events = await loadUpcoming();
  } catch {
    // CI / local without SUPABASE_SERVICE_ROLE_KEY still render the shell.
    events = [];
  }

  return (
    <EventPageShell className="py-10">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <FcSectionHeader
          className="mb-0"
          title="Events"
          subtitle="Public gatherings you can open without an account."
        />
        <Link href="/events/new" className="inline-flex">
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
        <PublicEventList events={events} />
      )}
    </EventPageShell>
  );
}
