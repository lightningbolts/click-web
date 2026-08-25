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

const TABS: { id: TabId; label: string; icon: LucideIcon }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'heatmap', label: 'Heatmap', icon: MapPin },
  { id: 'events', label: 'Events', icon: CalendarDays },
  { id: 'live', label: 'Vibe Stream', icon: MessageSquare },
];

type TabId = 'overview' | 'heatmap' | 'events' | 'live';

const COMPANION: Record<TabId, string> = {
  overview: 'Same cards as Insights: sticky score, density, and live count. This is sample HUB data, not a live feed.',
  heatmap: 'Heatmap and tribe bubbles match the venue dashboard. Floor pins stay in the browser.',
  events: 'Tonight’s programming with RSVP and who actually met, the same events students share.',
  live: 'Anonymous floor notes, same vibe stream operators see on Insights.',
};

export default function EnterprisePlayground() {
  const [tab, setTab] = useState<TabId>('overview');

  return (
    <div data-testid="enterprise-playground" className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_16rem]">
      <div>
        <WebChrome label="Insights · HUB (demo)" address="click.app / insights" lockScroll>
          <div className="flex h-full min-h-0 items-stretch">
            <nav
              className="flex w-28 shrink-0 flex-col gap-1 self-stretch border-r border-border-hard bg-surface p-2 sm:w-40"
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
                    className={`flex items-center gap-2 rounded-[8px] px-2 py-2 text-left text-xs font-semibold sm:px-3 sm:text-sm ${
                      selected
                        ? 'bg-primary-container text-on-primary-container'
                        : 'text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface'
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </nav>
            <div className="min-h-0 min-w-0 flex-1 overflow-y-auto p-4 md:p-6">
              <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
                Demo data
              </p>
              {tab === "overview" ? (
                <OverviewScene />
              ) : tab === "heatmap" ? (
                <HeatmapScene />
              ) : tab === "events" ? (
                <EventsScene />
              ) : (
                <LiveScene />
              )}
            </div>
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
