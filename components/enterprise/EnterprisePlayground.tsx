'use client';

import { useState } from 'react';
import {
  CalendarDays,
  LayoutDashboard,
  MapPin,
  MessageSquare,
  type LucideIcon,
} from 'lucide-react';
import { WebChrome } from '@/components/landing/playground/DeviceChrome';
import {
  EventsScene,
  HeatmapScene,
  LiveScene,
  OverviewScene,
} from './EnterpriseInsightsScenes';

const TABS: { id: TabId; label: string; eyebrow: string; icon: LucideIcon }[] = [
  { id: 'overview', label: 'Overview', eyebrow: 'At a glance', icon: LayoutDashboard },
  { id: 'heatmap', label: 'Heatmap', eyebrow: 'Where people meet', icon: MapPin },
  { id: 'events', label: 'Events', eyebrow: 'What converts', icon: CalendarDays },
  { id: 'live', label: 'Vibe Stream', eyebrow: 'What is happening now', icon: MessageSquare },
];

type TabId = 'overview' | 'heatmap' | 'events' | 'live';

const COMPANION: Record<TabId, { title: string; body: string; signal: string }> = {
  overview: {
    title: 'A venue-level read, not vanity analytics',
    body: 'The overview combines connection density, activity, and attendance into one operating view using sample HUB data.',
    signal: 'Use this to understand whether people are actually meeting, not just opening an app.',
  },
  heatmap: {
    title: 'See where real-world interaction concentrates',
    body: 'The heatmap mirrors the venue dashboard with floor-level pins and connection density, so operators can compare spaces rather than raw traffic alone.',
    signal: 'Use this to identify high-value areas, dead zones, and changes after programming or layout decisions.',
  },
  events: {
    title: 'Connect programming to actual interaction',
    body: 'Event performance pairs RSVPs with downstream meeting activity instead of treating attendance as the end metric.',
    signal: 'Use this to distinguish events that draw a crowd from events that create meaningful interaction.',
  },
  live: {
    title: 'A lightweight pulse of the room',
    body: 'Anonymous floor notes provide qualitative context alongside the quantitative views without exposing individual identities.',
    signal: 'Use this to explain sudden changes in density or event behavior while they are happening.',
  },
};

export default function EnterprisePlayground() {
  const [tab, setTab] = useState<TabId>('overview');
  const active = TABS.find((item) => item.id === tab) ?? TABS[0];

  return (
    <div data-testid="enterprise-playground" className="space-y-5">
      <div className="flex flex-col gap-3 rounded-[20px] border border-border-hard bg-surface px-5 py-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Interactive business demo</p>
          <h3 className="mt-1 text-xl font-bold tracking-tight text-on-surface sm:text-2xl">See how Click turns in-person activity into an operating signal.</h3>
        </div>
        <p className="max-w-md text-sm leading-relaxed text-on-surface-variant">
          Explore the same sample venue from four perspectives. This demo contains no customer or live production data.
        </p>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0 overflow-hidden rounded-[20px] border border-border-hard bg-surface shadow-sm">
          <WebChrome label="Insights · HUB demo" address="click.app / insights" lockScroll>
            <div className="flex h-full min-h-0 flex-col lg:flex-row lg:items-stretch">
              <nav
                className="flex shrink-0 gap-1 overflow-x-auto border-b border-border-hard bg-surface p-2 lg:w-44 lg:flex-col lg:overflow-visible lg:border-b-0 lg:border-r"
                role="tablist"
                aria-label="Venue demo"
              >
                {TABS.map((item) => {
                  const Icon = item.icon;
                  const selected = tab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      role="tab"
                      aria-selected={selected}
                      onClick={() => setTab(item.id)}
                      className={`flex min-w-max items-center gap-2 rounded-[10px] px-3 py-2.5 text-left text-xs font-semibold transition-colors lg:min-w-0 ${
                        selected
                          ? 'bg-primary text-on-primary shadow-sm'
                          : 'text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface'
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0" aria-hidden />
                      <span className="truncate">{item.label}</span>
                    </button>
                  );
                })}
              </nav>

              <div className="min-h-0 min-w-0 flex-1 overflow-y-auto p-4 sm:p-5 md:p-6">
                <div className="mb-5 flex items-start justify-between gap-4 border-b border-border-hard pb-4">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary">{active.eyebrow}</p>
                    <p className="mt-1 text-sm text-on-surface-variant">Sample HUB data · Seattle campus venue</p>
                  </div>
                  <span className="rounded-full border border-border-hard bg-surface-container px-3 py-1 text-[11px] font-semibold text-on-surface-variant">
                    Demo data
                  </span>
                </div>

                {tab === 'overview' ? (
                  <OverviewScene />
                ) : tab === 'heatmap' ? (
                  <HeatmapScene />
                ) : tab === 'events' ? (
                  <EventsScene />
                ) : (
                  <LiveScene />
                )}
              </div>
            </div>
          </WebChrome>
        </div>

        <aside className="h-fit rounded-[20px] border border-border-hard bg-surface p-5 shadow-sm xl:sticky xl:top-24">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">What this view answers</p>
          <h4 className="mt-3 text-lg font-bold leading-snug text-on-surface">{COMPANION[tab].title}</h4>
          <p className="mt-3 text-sm leading-relaxed text-on-surface-variant">{COMPANION[tab].body}</p>
          <div className="mt-5 rounded-[14px] bg-surface-container p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-on-surface">Operator signal</p>
            <p className="mt-2 text-sm leading-relaxed text-on-surface-variant">{COMPANION[tab].signal}</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
