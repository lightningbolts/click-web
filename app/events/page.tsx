import { CalendarDays, Plus } from "lucide-react";
import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
import { cookies } from "next/headers";
import { Button } from "@/components/ds/Button";
import { EmptyState } from "@/components/ds/EmptyState";
import { Timeline, TimelineDay } from "@/components/ds/Timeline";
import { DirectoryEventRow } from "@/components/events/DirectoryEventRow";
import { EventDirectoryControls } from "@/components/events/EventDirectoryControls";
import { YourEventsStrip } from "@/components/events/YourEventsStrip";
import { buildEventDirectory, directoryHref, parseDirectoryQuery, PUBLIC_EVENTS_TAG } from "@/lib/events/directory";
import { loadPublicPastEvents, loadPublicUpcomingEvents, type PublicEventListItem } from "@/lib/events/publicEvent";
import { createAdminSupabaseClient } from "@/lib/server/admin/supabaseAdmin";
import { getServerUser } from "@/lib/server/getServerUser";
import { TIME_ZONE_COOKIE, validTimeZone } from "@/lib/time/viewerTimeZone";

// Request-time only: listing uses the service-role client, which is optional
// for `next build` (see .env.example) and present on the Worker at runtime.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Events",
  description: "Gatherings you can open without an account.",
};

/** Enough for 30-at-a-time paging; the loader scans the newest 200 public events. */
const DIRECTORY_LIMIT = 200;

const loadUpcoming = unstable_cache(
  async () => loadPublicUpcomingEvents(createAdminSupabaseClient(), DIRECTORY_LIMIT),
  ["public-upcoming-events-v2"],
  { revalidate: 60, tags: [PUBLIC_EVENTS_TAG] },
);

const loadPast = unstable_cache(
  async () => loadPublicPastEvents(createAdminSupabaseClient(), DIRECTORY_LIMIT),
  ["public-past-events-v2"],
  { revalidate: 60, tags: [PUBLIC_EVENTS_TAG] },
);

export default async function PublicEventsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [params, user, jar] = await Promise.all([searchParams, getServerUser(), cookies()]);
  const query = parseDirectoryQuery(params);
  const timeZone = validTimeZone(jar.get(TIME_ZONE_COOKIE)?.value) ?? "UTC";
  let items: PublicEventListItem[] = [];
  try {
    items = await (query.tab === "past" ? loadPast() : loadUpcoming());
  } catch {
    // CI / local without SUPABASE_SERVICE_ROLE_KEY still render the page.
  }
  // eslint-disable-next-line react-hooks/purity -- server component, rendered per request
  const nowMs = Date.now();
  const dir = buildEventDirectory(items, query, { timeZone, nowMs });
  const searching = Boolean(query.q);
  const flat = query.sort !== "date";

  return (
    <div className="container-content pb-24 pt-8 md:pt-12">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="type-title-1 text-fg">Events</h1>
          <p className="type-body mt-1 text-fg-secondary">Gatherings you can open without an account.</p>
        </div>
        {user ? (
          <Button variant="primary" href="/events/new" icon={Plus}>
            Create event
          </Button>
        ) : (
          <Button href="/login?next=%2Fevents%2Fnew" variant="secondary">
            Log in to host
          </Button>
        )}
      </header>

      <div className="mb-8">
        <EventDirectoryControls query={query} />
      </div>

      {user && query.tab === "upcoming" && !searching ? <YourEventsStrip timeZone={timeZone} initialFilter={params.view === "saved" ? "saved" : null} /> : null}

      {dir.featured ? (
        <div className="mb-10">
          <DirectoryEventRow event={dir.featured} timeZone={timeZone} nowMs={nowMs} timeOnly={false} featured />
        </div>
      ) : null}

      {dir.days.length === 0 && !dir.featured ? (
        searching ? (
          <EmptyState
            icon={CalendarDays}
            title="No matching events"
            body={`Nothing ${query.tab === "past" ? "past" : "coming up"} matches “${query.q}”.`}
            action={
              <Button href={directoryHref({ ...query, q: "", page: 1 })} variant="secondary">
                Clear search
              </Button>
            }
          />
        ) : query.tab === "past" ? (
          <EmptyState icon={CalendarDays} title="No past events yet" body="Events show up here after they end." />
        ) : (
          <EmptyState
            icon={CalendarDays}
            title="No upcoming events yet"
            body="Public events show up here for anyone with the link."
            action={
              <Button variant="primary" href={user ? "/events/new" : "/login?next=%2Fevents%2Fnew"} icon={Plus}>
                Create the first one
              </Button>
            }
          />
        )
      ) : flat ? (
        <ul className="space-y-2" aria-label="Events">
          {dir.days[0]?.events.map((e) => (
            <li key={e.beacon_id}>
              <DirectoryEventRow event={e} timeZone={timeZone} nowMs={nowMs} timeOnly={false} />
            </li>
          ))}
        </ul>
      ) : (
        <Timeline label={query.tab === "past" ? "Past events" : "Upcoming events"}>
          {dir.days.map((day) => (
            <TimelineDay key={day.key} id={`day-${day.key}`} title={day.title} subtitle={day.subtitle}>
              <ul className="space-y-2">
                {day.events.map((e) => (
                  <li key={e.beacon_id}>
                    <DirectoryEventRow event={e} timeZone={timeZone} nowMs={nowMs} timeOnly={day.key !== "tba"} />
                  </li>
                ))}
              </ul>
            </TimelineDay>
          ))}
        </Timeline>
      )}

      {dir.hasMore ? (
        <div className="mt-8 flex flex-col items-center gap-2">
          <Button href={directoryHref({ ...query, page: query.page + 1 })} variant="secondary" scroll={false}>
            Show more
          </Button>
          <p className="type-meta tabular text-fg-tertiary">
            Showing {dir.shown} of {dir.total}
          </p>
        </div>
      ) : null}
    </div>
  );
}
