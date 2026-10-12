'use client';

import dynamic from 'next/dynamic';
import { LazyMotion, domAnimation } from 'framer-motion';
import { useState } from 'react';
import { CardVisual } from '@/components/ds/CardVisual';
import { InlineNotice } from '@/components/ds/InlineNotice';
import { Skeleton } from '@/components/ds/Skeleton';
import { StatusPill } from '@/components/ds/StatusPill';
import { ConnectionDensityCard, LiveCountCard, StickyScoreCard } from '@/components/insights/StickyScoreCard';
import { InsightsDemoProvider } from '@/components/insights/InsightsDemoContext';
import { INSIGHTS_NAV } from '@/components/business/InsightsSections';
import { BrowserFrame } from '@/components/landing/playground/Frames';
import { mockVenueInsights } from '@/lib/insights/mockData';
import { cn } from '@/lib/cn';
import type { InsightsSection } from '@/lib/places/workspace';

// The real Insights sections, in demo mode: sample data, no requests (spec §9.5).
const loading = () => <Skeleton rounded="lg" className="h-72" />;
const PlaceInsights = dynamic(() => import('@/components/insights/sections/PlaceInsightsClient'), { ssr: false, loading });
const LiveMetrics = dynamic(() => import('@/components/insights/sections/LiveMetricsClient'), { ssr: false, loading });
const Heatmap = dynamic(() => import('@/components/insights/sections/HeatmapClient'), { ssr: false, loading });
const Tribes = dynamic(() => import('@/components/insights/sections/TribesClient'), { ssr: false, loading });
const VibeStream = dynamic(() => import('@/components/insights/sections/VibeStreamClient'), { ssr: false, loading });
const EventEngagement = dynamic(() => import('@/components/insights/sections/EventEngagementClient'), { ssr: false, loading });

const PLACE = { id: 'demo', name: 'Northlight Hall' };

/** What each section answers, in the operator's words. */
const ANSWERS: Record<InsightsSection, string> = {
  overview: 'Are people meeting here, and coming back?',
  traffic: 'Which parts of the venue do people meet in?',
  crowd: 'Which communities make up the room?',
  vibe: 'How does the room feel right now?',
  events: 'Which events turn RSVPs into check-ins?',
};

function Section({ id }: { id: InsightsSection }) {
  switch (id) {
    case 'overview':
      return (
        <>
          <div className="grid gap-4 @3xl:grid-cols-3">
            <StickyScoreCard data={mockVenueInsights.stickyScore} />
            <ConnectionDensityCard data={mockVenueInsights.connectionDensity} />
            <LiveCountCard data={mockVenueInsights.liveCount} />
          </div>
          <PlaceInsights placeId={PLACE.id} range={90} />
          <LiveMetrics placeId={PLACE.id} />
        </>
      );
    case 'traffic':
      return <Heatmap placeId={PLACE.id} />;
    case 'crowd':
      return <Tribes placeId={PLACE.id} />;
    case 'vibe':
      return <VibeStream placeId={PLACE.id} />;
    case 'events':
      return <EventEngagement placeId={PLACE.id} />;
  }
}

/**
 * A sample Place's Insights tab, as a manager sees it on joinclick.co. The sections are the
 * product's own components fed sample data, so the demo can't drift from the real thing.
 */
export default function EnterprisePlayground() {
  const [section, setSection] = useState<InsightsSection>('overview');
  const path = `/business/places/${PLACE.id}/insights${section === 'overview' ? '' : `/${section}`}`;

  return (
    <div data-testid="enterprise-playground">
      <BrowserFrame path={path} testId="enterprise-browser" className="h-[clamp(600px,calc(100svh-120px),820px)]">
        <div className="flex h-14 shrink-0 items-center gap-3 border-b border-hairline px-4 @2xl:px-6">
          <CardVisual seed={PLACE.id} radius="sm" className="size-8 shrink-0" />
          <span className="type-headline min-w-0 truncate text-fg">{PLACE.name}</span>
          <StatusPill variant="success">Live</StatusPill>
        </div>
        <div className="flex min-h-0 flex-1 flex-col @4xl:flex-row">
          <nav
            aria-label="Insights sections"
            className="shrink-0 border-b border-hairline px-3 py-2 @4xl:w-[200px] @4xl:border-b-0 @4xl:border-r @4xl:px-3 @4xl:py-4"
          >
            <ul className="no-scrollbar flex gap-2 overflow-x-auto @4xl:flex-col @4xl:gap-0.5">
              {INSIGHTS_NAV.map((item) => {
                const active = item.id === section;
                return (
                  <li key={item.id} className="shrink-0">
                    <button
                      type="button"
                      onClick={() => setSection(item.id)}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'type-body inline-flex h-9 items-center rounded-pill px-3.5 font-semibold @4xl:flex @4xl:h-10 @4xl:w-full @4xl:rounded-md @4xl:px-3',
                        active
                          ? 'bg-selection text-accent'
                          : 'bg-fill-subtle text-fg hover:bg-fill-strong @4xl:bg-transparent @4xl:hover:bg-hover',
                      )}
                    >
                      {item.label}
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>
          <div className="no-scrollbar min-h-0 min-w-0 flex-1 overflow-y-auto">
            <div className="flex flex-col gap-6 p-4 @2xl:p-6" data-testid={`enterprise-section-${section}`}>
              <InlineNotice variant="warning">Demo data. These numbers are samples, not a real Place.</InlineNotice>
              <p className="type-title-3 text-fg">{ANSWERS[section]}</p>
              <InsightsDemoProvider demoMode>
                <LazyMotion features={domAnimation}>
                  <div className="flex min-w-0 flex-col gap-10">
                    <Section id={section} />
                  </div>
                </LazyMotion>
              </InsightsDemoProvider>
            </div>
          </div>
        </div>
      </BrowserFrame>
    </div>
  );
}
