'use client';

import { CalendarDays, MapPin, Navigation, Users } from 'lucide-react';
import { useState } from 'react';
import { PlaygroundAvatar } from '../DeviceChrome';
import { PLAYGROUND_EVENTS, PLAYGROUND_PEOPLE } from '../mockData';
import type { PlaygroundActions, PlaygroundState } from '../types';

export default function EventsScene({
  state,
  actions,
  onAnnounce,
}: {
  state: PlaygroundState;
  actions: PlaygroundActions;
  onAnnounce: (message: string) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(PLAYGROUND_EVENTS[0]?.id ?? null);
  const open = PLAYGROUND_EVENTS.find((e) => e.id === openId) ?? PLAYGROUND_EVENTS[0];
  const featured = PLAYGROUND_EVENTS[0];

  const goingPeople = (open?.attendeeIds ?? [])
    .filter((id) => state.connectedIds.has(id))
    .map((id) => PLAYGROUND_PEOPLE.find((p) => p.id === id))
    .filter((p): p is NonNullable<typeof p> => Boolean(p));

  const rsvped = open ? state.rsvpIds.has(open.id) : false;
  const routed = open ? state.routeIds.has(open.id) : false;

  const toggleRsvp = () => {
    if (!open) return;
    actions.toggleRsvp(open.id);
    const next = !state.rsvpIds.has(open.id);
    onAnnounce(next ? `RSVP’d to ${open.title}` : `Removed RSVP for ${open.title}`);
  };

  const toggleRoute = () => {
    if (!open) return;
    actions.toggleRoute(open.id);
    const next = !state.routeIds.has(open.id);
    onAnnounce(next ? `Joined event route for ${open.title}` : `Left event route for ${open.title}`);
  };

  return (
    <div className="flex h-full flex-col overflow-auto bg-background" data-testid="playground-scene-events">
      <div className="border-b border-border-hard px-4 py-3">
        <p className="text-xs text-on-surface-variant">Good evening, Alex.</p>
        <h3 className="text-lg font-bold text-on-surface">Ready to connect today?</h3>
      </div>

      <div className="px-3 pt-3">
        <div className="flex items-center gap-2 rounded-full border border-border-hard bg-surface px-3 py-2 text-xs text-on-surface-variant">
          <span className="font-semibold text-secondary">Search</span>
          people, events, places
        </div>
      </div>

      {featured ? (
        <button
          type="button"
          onClick={() => setOpenId(featured.id)}
          className="mx-3 mt-3 rounded-[16px] border border-secondary bg-secondary-container p-3 text-left"
        >
          <p className="text-[11px] font-semibold uppercase tracking-wider text-secondary">Featured</p>
          <p className="mt-1 text-sm font-bold text-on-secondary-container">{featured.title}</p>
          <p className="text-xs text-on-secondary-container">
            {featured.when} · {featured.venue}
          </p>
          {state.rsvpIds.has(featured.id) ? (
            <p className="mt-1 text-[11px] font-semibold text-secondary">You&apos;re going</p>
          ) : null}
        </button>
      ) : null}

      <div className="px-3 pt-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-secondary">I&apos;m down for…</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {['Coffee', 'Live music'].map((intent) => (
            <span
              key={intent}
              className="rounded-full bg-secondary px-3 py-1 text-[11px] font-semibold text-on-secondary"
            >
              {intent}
            </span>
          ))}
          <span className="rounded-full border border-border-hard px-3 py-1 text-[11px] font-semibold text-on-surface-variant">
            Edit intents
          </span>
        </div>
      </div>

      <ul className="space-y-2 px-3 py-3">
        {PLAYGROUND_EVENTS.slice(1).map((event) => {
          const selected = event.id === open?.id;
          const going = state.rsvpIds.has(event.id);
          return (
            <li key={event.id}>
              <button
                type="button"
                onClick={() => setOpenId(event.id)}
                className={`w-full rounded-[12px] border px-3 py-2.5 text-left ${
                  selected ? 'border-secondary bg-secondary-container' : 'border-border-hard bg-surface'
                }`}
              >
                <p className="text-sm font-semibold text-on-surface">{event.title}</p>
                <p className="text-xs text-on-surface-variant">
                  {event.when} · {event.venue}
                </p>
                {going ? (
                  <p className="mt-1 text-[11px] font-semibold text-secondary">You&apos;re going</p>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>

      {open ? (
        <div className="mt-auto border-t border-border-hard bg-surface px-4 py-3">
          <p className="text-sm font-bold text-on-surface">{open.title}</p>
          <p className="mt-1 flex items-center gap-1 text-xs text-on-surface-variant">
            <CalendarDays className="h-3 w-3" /> {open.when}
          </p>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-on-surface-variant">
            <MapPin className="h-3 w-3" /> {open.venue} · Host {open.host}
          </p>
          <p className="mt-2 text-xs text-on-surface-variant">{open.description}</p>
          <div className="mt-2 flex items-center gap-2">
            <Users className="h-3.5 w-3.5 text-primary" />
            {goingPeople.length > 0 ? (
              <div className="flex items-center gap-1">
                {goingPeople.map((p) => (
                  <PlaygroundAvatar key={p.id} initials={p.initials} size="sm" />
                ))}
                <span className="text-[11px] text-on-surface-variant">
                  {goingPeople.map((p) => p.name.split(' ')[0]).join(', ')} going
                </span>
              </div>
            ) : (
              <span className="text-[11px] text-on-surface-variant">None of your Clicks yet</span>
            )}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              data-testid={`playground-rsvp-${open.id}`}
              onClick={toggleRsvp}
              className={`py-2.5 text-xs ${rsvped ? 'fc-btn-secondary' : 'fc-btn-primary'}`}
            >
              {rsvped ? 'Cancel RSVP' : 'RSVP'}
            </button>
            <button
              type="button"
              onClick={toggleRoute}
              className={`inline-flex items-center justify-center gap-1 rounded-[8px] py-2.5 text-xs font-bold ${
                routed
                  ? 'bg-secondary text-on-secondary'
                  : 'border border-secondary bg-secondary-container text-secondary'
              }`}
            >
              <Navigation className="h-3 w-3" />
              {routed ? 'On route' : 'Join route'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
