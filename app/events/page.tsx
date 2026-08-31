import { unstable_cache } from "next/cache";
import { createAdminSupabaseClient } from "@/lib/server/admin/supabaseAdmin";
import { loadPublicPastEvents, loadPublicUpcomingEvents } from "@/lib/events/publicEvent";
import EventsPageBody from "@/components/events/EventsPageBody";

// Request-time only: listing uses the service-role client, which is optional
// for `next build` (see .env.example) and present on the Worker at runtime.
export const dynamic = "force-dynamic";

const loadUpcoming = () =>
  unstable_cache(
    async () => loadPublicUpcomingEvents(createAdminSupabaseClient()),
    ["public-upcoming-events-v1"],
    { revalidate: 60 },
  )();

const loadPast = () =>
  unstable_cache(
    async () => loadPublicPastEvents(createAdminSupabaseClient()),
    ["public-past-events-v1"],
    { revalidate: 60 },
  )();

export default async function PublicEventsPage() {
  let upcomingEvents: Awaited<ReturnType<typeof loadPublicUpcomingEvents>> = [];
  let pastEvents: Awaited<ReturnType<typeof loadPublicPastEvents>> = [];
  try {
    [upcomingEvents, pastEvents] = await Promise.all([loadUpcoming(), loadPast()]);
  } catch {
    // CI / local without SUPABASE_SERVICE_ROLE_KEY still render the shell.
    upcomingEvents = [];
    pastEvents = [];
  }

  return <EventsPageBody upcomingEvents={upcomingEvents} pastEvents={pastEvents} />;
}
