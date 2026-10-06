import type { Metadata } from 'next';
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { CalendarPlus } from 'lucide-react';
import { RefreshRetryRow } from '@/components/business/RefreshRetryRow';
import { UrlSegmented } from '@/components/business/UrlSegmented';
import { Button } from '@/components/ds/Button';
import { EmptyState } from '@/components/ds/EmptyState';
import { EventRow } from '@/components/ds/EventRow';
import { Timeline, TimelineDay } from '@/components/ds/Timeline';
import { groupByDay } from '@/lib/events/directory';
import { eventManagePath } from '@/lib/events/eventUrls';
import { canWrite } from '@/lib/places/workspace';
import { createAdminSupabaseClient } from '@/lib/server/admin/supabaseAdmin';
import { loadPlaceEvents, type PlaceEventItem } from '@/lib/server/places/placeEvents';
import { loadWorkspace } from '@/lib/server/places/workspace';
import { eventHref } from '@/lib/shell/appNav';

type Params = Promise<{ placeId: string }>;
type Tab = 'upcoming' | 'past';

export const metadata: Metadata = { title: 'Events · Business · Click', robots: { index: false } };

/** Official events hosted as this Place (spec §9.5). Creating them is free. */
export default async function PlaceEventsPage({ params, searchParams }: { params: Params; searchParams: Promise<{ tab?: string }> }) {
  const [{ placeId }, sp] = await Promise.all([params, searchParams]);
  const ws = await loadWorkspace(placeId);
  if (ws.kind !== 'ok') notFound();
  const { place } = ws;
  const tab: Tab = sp.tab === 'past' ? 'past' : 'upcoming';
  // eslint-disable-next-line react-hooks/purity -- server component, rendered per request
  const nowMs = Date.now();
  let events: PlaceEventItem[] | null = null;
  try {
    events = await loadPlaceEvents(createAdminSupabaseClient(), place.id, { when: tab, nowMs });
  } catch (e) {
    console.error('[place events]', e instanceof Error ? e.message : e);
  }
  const writer = canWrite(place.role);
  const createHref = `/events/new?host=place:${place.id}`;
  const time = new Intl.DateTimeFormat('en-US', { timeZone: place.timezone, hour: 'numeric', minute: '2-digit' });
  const days = events ? groupByDay(events, (e) => e.startAt, { timeZone: place.timezone, nowMs }) : [];

  return (
    <div className="max-w-[880px]">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Suspense>
          <UrlSegmented<Tab>
            param="tab"
            value={tab}
            label="Which events"
            segments={[
              { value: 'upcoming', label: 'Upcoming' },
              { value: 'past', label: 'Past' },
            ]}
          />
        </Suspense>
        {writer ? (
          <Button variant="primary" icon={CalendarPlus} href={createHref}>
            Create event
          </Button>
        ) : null}
      </div>

      {events == null ? (
        <RefreshRetryRow thing="events" />
      ) : events.length === 0 ? (
        <EmptyState
          icon={CalendarPlus}
          title={tab === 'past' ? 'No past events' : 'No events coming up'}
          body="Events you host as this Place appear on your Place page and the map."
          action={
            writer && tab === 'upcoming' ? (
              <Button variant="tinted" href={createHref}>
                Create event
              </Button>
            ) : undefined
          }
        />
      ) : (
        <Timeline label={tab === 'past' ? 'Past events' : 'Upcoming events'}>
          {days.map((day) => (
            <TimelineDay key={day.key} id={`place-events-${day.key}`} title={day.title} subtitle={day.subtitle}>
              <ul className="flex flex-col gap-2">
                {day.events.map((e) => (
                  <li key={e.id} className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <EventRow
                      href={eventHref(e.id)}
                      id={e.id}
                      title={e.title}
                      timeLabel={e.startAt ? time.format(Date.parse(e.startAt)) : 'Time to be announced'}
                      location={e.locationName}
                      photoUrl={e.imageUrl}
                      going={e.rsvpCount > 0 ? { people: [], count: e.rsvpCount } : null}
                      className="min-w-0 flex-1"
                    />
                    <span className="flex shrink-0 gap-2 sm:flex-col">
                      <Button size="sm" variant="secondary" href={eventManagePath(e.id)}>
                        Manage
                      </Button>
                      <Button size="sm" variant="plain" href={eventHref(e.id)}>
                        View
                      </Button>
                    </span>
                  </li>
                ))}
              </ul>
            </TimelineDay>
          ))}
        </Timeline>
      )}
    </div>
  );
}
