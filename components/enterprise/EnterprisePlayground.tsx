'use client';

import { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { WebChrome } from '@/components/landing/playground/DeviceChrome';
import PinMapLazy from '@/components/maps/PinMapLazy';
import { fadePresence, fadeTransition } from '@/lib/motion';
import { DEMO_EVENTS, DEMO_PULSE, DEMO_ROOMS } from './enterpriseMock';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'floor', label: 'Floor' },
  { id: 'events', label: 'Events' },
  { id: 'live', label: 'Live' },
] as const;

type TabId = (typeof TABS)[number]['id'];

const COMPANION: Record<TabId, string> = {
  overview: 'Sample night at the Husky Union Building. These numbers are demo data, not a live feed.',
  floor: 'Pins mark rooms where people actually met. Pan and zoom stay in the browser — tiles never hit our Worker.',
  events: 'Tonight’s programming, with who’s going. Same public event pages students already share.',
  live: 'A simple pulse of the last hour. Operators see whether a room mixed people or just filled seats.',
};

export default function EnterprisePlayground() {
  const [tab, setTab] = useState<TabId>('overview');
  const reduceMotion = useReducedMotion();

  return (
    <div data-testid="enterprise-playground" className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_16rem]">
      <div>
        <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="Venue demo">
          {TABS.map((item) => {
            const selected = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setTab(item.id)}
                className={`rounded-full px-4 py-2 text-sm font-semibold ${
                  selected
                    ? 'bg-primary text-on-primary'
                    : 'border border-border-hard bg-surface text-on-surface hover:bg-surface-container'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
        <WebChrome label="Insights · HUB (demo)">
          <div className="p-4 md:p-6">
            <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
              Demo data
            </p>
            <AnimatePresence mode="wait">
              <motion.div
                key={tab}
                {...(reduceMotion ? {} : fadePresence)}
                transition={fadeTransition(0.18)}
              >
                {tab === 'overview' ? <OverviewScene /> : null}
                {tab === 'floor' ? <FloorScene /> : null}
                {tab === 'events' ? <EventsScene /> : null}
                {tab === 'live' ? <LiveScene /> : null}
              </motion.div>
            </AnimatePresence>
          </div>
        </WebChrome>
      </div>
      <aside className="rounded-[16px] border border-border-hard bg-surface p-5 text-sm leading-relaxed text-on-surface-variant">
        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-on-surface">What you’re seeing</p>
        <p>{COMPANION[tab]}</p>
      </aside>
    </div>
  );
}

function OverviewScene() {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {[
        { label: 'In the building', value: '214' },
        { label: 'People who met', value: '67' },
        { label: 'Repeat hellos', value: '19' },
      ].map((stat) => (
        <div key={stat.label} className="rounded-[16px] border border-border-hard bg-background p-4">
          <p className="text-3xl font-bold text-on-surface">{stat.value}</p>
          <p className="mt-1 text-sm text-on-surface-variant">{stat.label}</p>
        </div>
      ))}
    </div>
  );
}

function FloorScene() {
  return (
    <PinMapLazy
      testId="enterprise-floor-map"
      markers={DEMO_ROOMS.map((room) => ({
        id: room.id,
        lat: room.lat,
        lng: room.lng,
        label: room.label,
        tone: room.tone,
      }))}
    />
  );
}

function EventsScene() {
  return (
    <ul className="space-y-3">
      {DEMO_EVENTS.map((event) => (
        <li key={event.id} className="rounded-[16px] border border-border-hard bg-background p-4">
          <p className="font-bold text-on-surface">{event.title}</p>
          <p className="mt-1 text-sm text-on-surface-variant">
            {event.when} · {event.room} · {event.going} going
          </p>
        </li>
      ))}
    </ul>
  );
}

function LiveScene() {
  return (
    <ul className="space-y-3">
      {DEMO_PULSE.map((row) => (
        <li key={row.id} className="rounded-[16px] border border-border-hard bg-background p-4 text-sm text-on-surface">
          {row.text}
        </li>
      ))}
    </ul>
  );
}
