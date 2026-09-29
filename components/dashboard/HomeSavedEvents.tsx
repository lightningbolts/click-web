'use client';

import Link from 'next/link';
import { savedEventState, type SavedHomeEvent } from '@/lib/dashboard/homeFeed';
import { useHomeSavedEvents } from './useHomeSavedEvents';

export default function HomeSavedEvents({ userId, now, promotedEventId }: { userId: string; now: number; promotedEventId?: string }) {
  const { data, events, error, mutate, hasMore, size, setSize, isValidating } = useHomeSavedEvents(userId);
  const upcoming = events.filter((e) => ['upcoming', 'live'].includes(savedEventState(e, now)) && e.beacon_id !== promotedEventId)
    .sort((a, b) => (Date.parse(a.event_start_at ?? '') || Infinity) - (Date.parse(b.event_start_at ?? '') || Infinity));
  const past = events.filter((e) => ['past', 'unavailable'].includes(savedEventState(e, now)));
  function rows(items: SavedHomeEvent[]) {
    return <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{items.map((event) => {
      const unavailable = savedEventState(event, now) === 'unavailable';
      const date = event.event_start_at ? new Date(event.event_start_at) : null;
      const content = <><h3 className="break-words font-bold">{event.title || 'Event'}</h3>
        {unavailable ? <p className="mt-1 text-sm text-on-surface-variant">This event is no longer available.</p> : <>
          {date && Number.isFinite(date.getTime()) ? <p className="mt-1 text-sm">{date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</p> : null}
          {event.location_name || event.formatted_address ? <p className="mt-1 break-words text-sm">{event.location_name || event.formatted_address}</p> : null}
        </>}</>;
      const classes = 'block h-full rounded-xl border-2 border-border-hard p-4';
      return <li key={event.beacon_id}>{unavailable ? <div className={classes}>{content}</div> : <Link href={'/e/' + encodeURIComponent(event.beacon_id)} className={classes + ' hover:bg-surface-variant focus-visible:outline-2 focus-visible:outline-primary'}>{content}</Link>}</li>;
    })}</ul>;
  }
  return <section id="saved-events" className="fc-card rounded-2xl p-5" aria-label="Saved events">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-bold">Saved &amp; upcoming</h2><Link href="/events" className="text-sm font-semibold text-primary underline">Explore events</Link></div>
    {error ? <p role="alert" className="mt-4 text-sm">Couldn’t refresh saved events.{data ? ' Showing previously loaded events.' : ''} <button type="button" className="underline" onClick={() => void mutate()}>Retry</button></p> : null}
    {!data && !error ? <p role="status" className="mt-4 text-sm">Loading saved events…</p> : null}
    {data && events.length === 0 ? <p className="mt-4 text-sm text-on-surface-variant">Save an event to find it here when you’re ready to make plans.</p> : null}
    {upcoming.length > 0 ? rows(upcoming) : data && events.length > 0 ? <p className="mt-4 text-sm text-on-surface-variant">{promotedEventId ? 'Your next saved event is featured above.' : 'No upcoming saved events.'}</p> : null}
    {past.length > 0 ? <details className="mt-4"><summary className="cursor-pointer font-semibold">Past &amp; unavailable ({past.length})</summary>{rows(past)}</details> : null}
    {hasMore ? <button type="button" disabled={isValidating} onClick={() => void setSize(size + 1)} className="mt-4 rounded-xl border-2 border-border-hard px-4 py-2 font-semibold disabled:opacity-50">{isValidating ? 'Loading…' : 'Load more saved events'}</button> : null}
  </section>;
}
