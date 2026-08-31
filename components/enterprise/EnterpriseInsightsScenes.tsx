'use client';

import { useEffect, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import {
  ConnectionDensityCard,
  LiveCountCard,
  StickyScoreCard,
} from '@/components/insights/StickyScoreCard';
import { DEMO_EVENTS, DEMO_ROOMS } from '@/components/enterprise/enterpriseMock';
import PinMapLazy from '@/components/maps/PinMapLazy';
import { PLAYGROUND_MAX_BOUNDS } from '@/components/landing/playground/playgroundMapStyle';
import {
  mockVenueInsights,
  mockInsightsDailyData,
  mockInsightsHourlyDistribution,
  mockInsightsPeakHour,
} from '@/lib/insights/mockData';

const HeatmapView = dynamic(() => import('@/components/insights/HeatmapView'), { ssr: false });
const TribeChart = dynamic(() => import('@/components/insights/TribeChart'), { ssr: false });
const VibeStream = dynamic(() => import('@/components/insights/VibeStream'), { ssr: false });

function ClientOnly({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  if (!mounted) {
    return <div className="h-52 animate-pulse rounded-[16px] bg-surface-container" aria-hidden />;
  }
  return children;
}

export function OverviewScene() {
  const weekTotal = mockInsightsDailyData.reduce((sum, row) => sum + row.count, 0);
  const peak = Math.max(...mockInsightsHourlyDistribution);

  return (
    <div className="space-y-4">
      <ClientOnly>
        <div className="grid gap-3 sm:grid-cols-3">
          <StickyScoreCard data={mockVenueInsights.stickyScore} />
          <ConnectionDensityCard data={mockVenueInsights.connectionDensity} />
          <LiveCountCard data={mockVenueInsights.liveCount} />
        </div>
      </ClientOnly>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Total connections" hint="Last 30 days" value={String(weekTotal)} />
        <Stat label="Retention rate" hint="Returning visitors" value="42%" />
        <Stat label="Busiest day" hint="Highest activity" value="Saturday" />
        <Stat label="Peak hour" hint="Most active time" value={`${mockInsightsPeakHour}:00`} />
      </div>
      <div className="rounded-[16px] border border-border-hard bg-background p-4">
        <div className="mb-3 flex items-end justify-between gap-2">
          <div>
            <p className="text-sm font-medium text-on-surface">Popular times</p>
            <p className="text-xs text-on-surface-variant">Hourly distribution, same chart Insights uses</p>
          </div>
          <p className="text-xs text-on-surface-variant">Peak {mockInsightsPeakHour}:00</p>
        </div>
        <div className="flex h-28 items-end gap-0.5">
          {mockInsightsHourlyDistribution.map((count, hour) => (
            <div
              key={hour}
              className={`min-w-0 flex-1 rounded-t ${
                hour === mockInsightsPeakHour ? 'bg-primary' : 'bg-on-surface/20'
              }`}
              style={{ height: `${Math.max(8, (count / peak) * 100)}%` }}
              title={`${hour}:00 · ${count}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-[16px] border border-border-hard bg-background p-4">
      <p className="text-3xl font-bold text-on-surface">{value}</p>
      <p className="mt-1 text-sm text-on-surface-variant">{label}</p>
      {hint ? <p className="mt-1 text-xs text-on-surface-variant">{hint}</p> : null}
    </div>
  );
}

export function HeatmapScene() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <HeatmapView zones={mockVenueInsights.heatmapZones} />
      <TribeChart tribes={mockVenueInsights.tribes} />
      <div className="lg:col-span-2">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
          Floor pins
        </p>
        <PinMapLazy
          testId="enterprise-floor-map"
          maxBounds={PLAYGROUND_MAX_BOUNDS}
          markers={DEMO_ROOMS.map((room) => ({
            id: room.id,
            lat: room.lat,
            lng: room.lng,
            label: room.label,
            tone: room.tone,
          }))}
        />
      </div>
    </div>
  );
}

export function EventsScene() {
  return (
    <ul className="space-y-3">
      {DEMO_EVENTS.map((event) => (
        <li key={event.id} className="rounded-[16px] border border-border-hard bg-background p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-bold text-on-surface">{event.title}</p>
              <p className="mt-1 text-sm text-on-surface-variant">
                {event.when} · {event.room} · Host {event.host}
              </p>
            </div>
            <span className="rounded-full bg-primary/15 px-2.5 py-1 text-xs font-semibold text-primary">
              {event.going} going
            </span>
          </div>
          <p className="mt-2 text-sm text-on-surface-variant">{event.met} people met at this event</p>
        </li>
      ))}
    </ul>
  );
}

export function LiveScene() {
  return (
    <ClientOnly>
      <VibeStream messages={mockVenueInsights.vibeStream} autoScroll={false} />
    </ClientOnly>
  );
}
