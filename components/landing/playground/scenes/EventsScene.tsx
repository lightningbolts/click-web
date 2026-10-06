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
    <div className="flex h-full flex-col overflow-auto bg-bg" data-testid="playground-scene-events">
      <div className="border-b border-hairline px-4 py-3">
        <p className="text-xs text-fg-secondary">Good evening, Alex.</p>
        <h3 className="text-lg font-bold text-fg">Ready to connect today?</h3>
      </div>

      <div className="px-3 pt-3">
        <div className="flex items-center gap-2 rounded-full border border-hairline bg-surface px-3 py-2 text-xs text-fg-secondary">
          <span className="font-semibold text-accent">Search</span>
          people, events, places
        </div>
      </div>

      {featured ? (
        <button
          type="button"
          onClick={() => setOpenId(featured.id)}
          className="mx-3 mt-3 rounded-[16px] border border-action bg-selection p-3 text-left"
        >
          <p className="text-[11px] font-semibold uppercase tracking-wider text-fg-secondary">Featured</p>
          <p className="mt-1 text-sm font-bold text-accent">{featured.title}</p>
          <p className="text-xs text-accent">
            {featured.when} · {featured.venue}
          </p>
          {state.rsvpIds.has(featured.id) ? (
            <p className="mt-1 text-[11px] font-semibold text-accent">You&apos;re going</p>
          ) : null}
        </button>
      ) : null}

      <div className="px-3 pt-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-fg-secondary">I&apos;m down for…</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {['Coffee', 'Live music'].map((intent) => (
            <span
              key={intent}
              className="rounded-full bg-action px-3 py-1 text-[11px] font-semibold text-on-action"
            >
              {intent}
            </span>
          ))}
          <span className="rounded-full border border-hairline px-3 py-1 text-[11px] font-semibold text-fg-secondary">
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
                  selected ? 'border-action bg-selection' : 'border-hairline bg-surface'
                }`}
              >
                <p className="text-sm font-semibold text-fg">{event.title}</p>
                <p className="text-xs text-fg-secondary">
                  {event.when} · {event.venue}
                </p>
                {going ? (
                  <p className="mt-1 text-[11px] font-semibold text-accent">You&apos;re going</p>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>

      {open ? (
        <div className="mt-auto border-t border-hairline bg-surface px-4 py-3">
          <p className="text-sm font-bold text-fg">{open.title}</p>
          <p className="mt-1 flex items-center gap-1 text-xs text-fg-secondary">
            <CalendarDays className="h-3 w-3" /> {open.when}
          </p>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-fg-secondary">
            <MapPin className="h-3 w-3" /> {open.venue} · Host {open.host}
          </p>
          <p className="mt-2 text-xs text-fg-secondary">{open.description}</p>
          {goingPeople.length > 0 ? (
            <div className="mt-3">
              <p className="text-[11px] font-semibold text-fg">
                {goingPeople.length === 1
                  ? '1 person you know is going'
                  : `${goingPeople.length} people you know are going`}
              </p>
              <ul className="mt-2 space-y-1.5">
                {goingPeople.map((person) => (
                  <li key={person.id}>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded-[10px] px-1 py-1 text-left hover:bg-surface-raised"
                      onClick={() => {
                        actions.setOpenChatId(person.id);
                        actions.setDashboardTab('chat');
                      }}
                    >
                      <PlaygroundAvatar initials={person.initials} size="sm" online={person.online} />
                      <span className="text-xs font-semibold text-fg">{person.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="mt-2 flex items-center gap-2 text-[11px] text-fg-secondary">
              <Users className="h-3.5 w-3.5 text-accent" />
              None of your Clicks yet
            </p>
          )}
          {rsvped ? (
            <div className="mt-3 border-t border-hairline pt-3">
              <p className="text-[11px] font-semibold text-fg">Who&apos;s going</p>
              <ul className="mt-2 space-y-1.5">
                <li className="flex items-center gap-2 px-1 py-1 text-xs font-medium text-fg">
                  <PlaygroundAvatar initials="A" size="sm" />
                  You
                </li>
                {(open.attendeeIds ?? [])
                  .map((id) => PLAYGROUND_PEOPLE.find((p) => p.id === id))
                  .filter((p): p is NonNullable<typeof p> => Boolean(p))
                  .map((person) => (
                    <li key={person.id}>
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 rounded-[10px] px-1 py-1 text-left hover:bg-surface-raised"
                        onClick={() => {
                          actions.setOpenChatId(person.id);
                          actions.setDashboardTab('chat');
                        }}
                      >
                        <PlaygroundAvatar initials={person.initials} size="sm" online={person.online} />
                        <span className="text-xs font-semibold text-fg">{person.name}</span>
                      </button>
                    </li>
                  ))}
              </ul>
            </div>
          ) : null}
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
                  ? 'bg-action text-on-action'
                  : 'border border-action bg-selection text-accent'
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
