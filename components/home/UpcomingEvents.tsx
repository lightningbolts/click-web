import { CalendarPlus } from 'lucide-react';
import { EmptyState } from '@/components/ds/EmptyState';
import { EventRow, type EventRowPill } from '@/components/ds/EventRow';
import { SectionHeader } from '@/components/ds/SectionHeader';
import { Button } from '@/components/ds/Button';
import { eventIsLive } from '@/lib/home/selectOpportunity';
import { formatEventWhen } from '@/lib/home/format';
import type { HomeEvent } from '@/lib/home/types';
import { eventHref } from '@/lib/shell/appNav';

const RELATION_PILL: Record<HomeEvent['relation'], EventRowPill> = {
  hosting: { label: 'Hosting', variant: 'tinted' },
  going: { label: 'Going', variant: 'success' },
  saved: { label: 'Saved', variant: 'neutral' },
};

/** ⑤ Saved & upcoming: up to three, soonest first. */
export function UpcomingEvents({ events, timeZone, nowMs }: { events: HomeEvent[]; timeZone: string; nowMs: number }) {
  return (
    <section aria-labelledby="home-upcoming">
      <SectionHeader id="home-upcoming" title="Saved & upcoming" href="/events?view=mine" />
      {events.length === 0 ? (
        <EmptyState
          icon={CalendarPlus}
          headingLevel="h3"
          className="rounded-lg bg-surface py-8"
          title="Nothing planned yet"
          body="Save an event or RSVP and it shows up here."
          action={
            <Button href="/events" variant="secondary" size="sm">
              Browse events
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          {events.map((e) => (
            <EventRow
              key={e.id}
              compact
              href={eventHref(e.id)}
              id={e.id}
              title={e.title}
              timeLabel={formatEventWhen(e.startAt, timeZone, nowMs)}
              live={eventIsLive(e, nowMs)}
              location={e.locationName}
              photoUrl={e.imageUrl}
              pills={[RELATION_PILL[e.relation]]}
            />
          ))}
        </div>
      )}
    </section>
  );
}
