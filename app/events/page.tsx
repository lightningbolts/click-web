import Link from "next/link";
import { unstable_cache } from "next/cache";
import { createAdminSupabaseClient } from "@/lib/server/admin/supabaseAdmin";
import { loadPublicUpcomingEvents } from "@/lib/events/publicEvent";
import { FcButton, FcCard, FcPageShell, FcSectionHeader } from "@/components/fc";
import PublicEventList from "@/components/events/PublicEventList";

export const revalidate = 60;

const loadUpcoming = () =>
  unstable_cache(
    async () => loadPublicUpcomingEvents(createAdminSupabaseClient()),
    ["public-upcoming-events-v1"],
    { revalidate: 60 },
  )();

export default async function PublicEventsPage() {
  const events = await loadUpcoming();

  return (
    <FcPageShell className="px-4 py-10 md:px-8">
      <div className="mx-auto w-full max-w-4xl">
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
      </div>
    </FcPageShell>
  );
}
