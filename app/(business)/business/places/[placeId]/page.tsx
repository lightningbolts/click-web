import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CalendarPlus, Users } from 'lucide-react';
import { InsightsExplainer, InsightsSummaryCard } from '@/components/business/InsightsSummaryCard';
import { RefreshRetryRow } from '@/components/business/RefreshRetryRow';
import { SetupChecklist } from '@/components/business/SetupChecklist';
import { placeBase } from '@/components/business/WorkspaceHeader';
import { AvatarStack } from '@/components/ds/Avatar';
import { Button } from '@/components/ds/Button';
import { cardClassName } from '@/components/ds/Card';
import { EmptyState } from '@/components/ds/EmptyState';
import { EventRow } from '@/components/ds/EventRow';
import { SectionHeader } from '@/components/ds/SectionHeader';
import { StatTile } from '@/components/ds/StatTile';
import PlaceNowCard from '@/components/places/PlaceNowCard';
import { canWrite } from '@/lib/places/workspace';
import { loadPlaceOverview } from '@/lib/server/places/overview';
import { loadWorkspace, toWorkspacePlace } from '@/lib/server/places/workspace';
import { eventHref } from '@/lib/shell/appNav';

type Params = Promise<{ placeId: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const ws = await loadWorkspace((await params).placeId);
  return { title: ws.kind === 'ok' ? `${ws.place.name} · Business · Click` : 'Business · Click', robots: { index: false } };
}

/** Place Overview (spec §9.5): setup until live, Now, last 30 days, upcoming events, Insights, team. */
export default async function PlaceOverviewPage({ params }: { params: Params }) {
  const ws = await loadWorkspace((await params).placeId);
  if (ws.kind !== 'ok') notFound();
  const place = toWorkspacePlace(ws.place);
  // eslint-disable-next-line react-hooks/purity -- server component, rendered per request
  const nowMs = Date.now();
  const o = await loadPlaceOverview(place, ws.userId, nowMs);
  const live = place.verification_status === 'verified' && place.listed;
  const writer = canWrite(place.role);
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: place.timezone, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const createHref = `/events/new?host=place:${place.id}`;

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="flex min-w-0 flex-col gap-10">
        {!live && writer ? <SetupChecklist place={place} hasEvent={o.hasEvent} /> : null}
        {o.now ? <PlaceNowCard place={o.now} nowMs={nowMs} /> : null}

        <section aria-labelledby="overview-30d">
          <div className="mb-2 flex items-baseline justify-between px-1">
            <h2 id="overview-30d" className="type-headline text-fg">
              Last 30 days
            </h2>
            <span className="type-meta text-fg-tertiary">Counts only, never who</span>
          </div>
          {o.stats ? (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatTile label="Check-ins" value={o.stats.totals.check_ins} hint={`${o.stats.totals.unique_visitors} people`} />
              <StatTile label="Clicks made here" value={o.stats.totals.new_connections} />
              <StatTile label="Event RSVPs" value={o.eventRsvps ?? '—'} />
              <StatTile label="Pulses" value={o.stats.totals.pulses} />
            </div>
          ) : (
            <RefreshRetryRow thing="the last 30 days" />
          )}
        </section>

        <section aria-labelledby="overview-events">
          <SectionHeader
            id="overview-events"
            title="Upcoming events"
            action={
              writer ? (
                <Button size="sm" variant="secondary" icon={CalendarPlus} href={createHref}>
                  Create event
                </Button>
              ) : undefined
            }
          />
          <div className="mt-3">
            {o.upcoming == null ? (
              <RefreshRetryRow thing="events" />
            ) : o.upcoming.length === 0 ? (
              <EmptyState
                icon={CalendarPlus}
                title="No events coming up"
                body="Events you host as this Place show on your Place page and the map. Free on every plan."
                headingLevel="h3"
                className="rounded-lg bg-surface py-8 dark:shadow-[inset_0_0_0_1px_var(--hairline)]"
              />
            ) : (
              <ul className="flex flex-col gap-2">
                {o.upcoming.map((e) => (
                  <li key={e.id}>
                    <EventRow
                      href={eventHref(e.id)}
                      id={e.id}
                      title={e.title}
                      timeLabel={e.startAt ? fmt.format(Date.parse(e.startAt)) : 'Time to be announced'}
                      location={e.locationName}
                      photoUrl={e.imageUrl}
                      going={e.rsvpCount > 0 ? { people: [], count: e.rsvpCount } : null}
                    />
                  </li>
                ))}
                <li className="px-1">
                  <Button variant="plain" size="sm" href={`${placeBase(place.id)}/events`}>
                    All events
                  </Button>
                </li>
              </ul>
            )}
          </div>
        </section>
      </div>

      <aside className="flex min-w-0 flex-col gap-10">
        {place.entitled ? <InsightsSummaryCard placeId={place.id} /> : <InsightsExplainer place={place} />}
        <section aria-labelledby="overview-team" className={cardClassName({ className: 'flex flex-col gap-3' })}>
          <h2 id="overview-team" className="type-headline text-fg">
            Team
          </h2>
          <div className="flex items-center gap-3">
            {o.team.people.length ? (
              <AvatarStack people={o.team.people.map((p) => ({ seed: p.id, name: p.name, src: p.avatarUrl }))} total={o.team.count} size={32} />
            ) : (
              <Users size={20} aria-hidden className="text-fg-secondary" />
            )}
            <p className="type-body text-fg-secondary">
              {o.team.count} {o.team.count === 1 ? 'person manages' : 'people manage'} this Place
            </p>
          </div>
          {place.role === 'owner' ? (
            <Button variant="secondary" size="sm" href={`${placeBase(place.id)}/team`} className="self-start">
              Manage team
            </Button>
          ) : null}
        </section>
      </aside>
    </div>
  );
}
