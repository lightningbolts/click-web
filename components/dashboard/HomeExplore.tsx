'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { EventListCard } from '@/components/events/EventListCard';
import { eventIsPast } from '@/lib/events/eventMetadata';
import { fetchMineEvents, MINE_EVENTS_KEY } from './DashboardEventsModule';

export default function HomeExplore({ userId, now }: { userId: string; now: number }) {
  const { data, error, mutate } = useSWR(['home-upcoming-events', userId], () => fetchMineEvents(MINE_EVENTS_KEY));
  const nextEvent = (data?.events ?? []).filter((event) => !eventIsPast(event, now) && event.event_start_at && Number.isFinite(Date.parse(event.event_start_at)))
    .sort((a, b) => Date.parse(a.event_start_at!) - Date.parse(b.event_start_at!))[0];
  return <section className="space-y-4" aria-label="Explore and upcoming events">
    {error ? <p role="alert">Couldn’t load your next event. <button type="button" className="underline" onClick={() => void mutate()}>Retry</button></p> : null}
    {!data && !error ? <p role="status">Loading your next event…</p> : null}
    {nextEvent ? <div className="space-y-3"><h2 className="text-xl font-bold">Your next event</h2><EventListCard event={nextEvent} featured hostActions={nextEvent.role === 'creator'} /></div> : null}
    <div className="grid gap-3 sm:grid-cols-3">
      {[
        { href: '/events', title: 'Events', detail: 'Find something to look forward to.' },
        { href: '/?tab=hubs', title: 'Community hubs', detail: 'Discover conversations near you.' },
        { href: '/?tab=map', title: 'Your places', detail: 'Explore where your connections began.' },
      ].map((tile) => <Link key={tile.href} href={tile.href} className="fc-card rounded-2xl p-5 hover:border-primary"><h2 className="text-lg font-bold">{tile.title}</h2><p className="mt-2 text-sm text-on-surface-variant">{tile.detail}</p></Link>)}
    </div>
  </section>;
}
