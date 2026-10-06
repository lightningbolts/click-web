import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Skeleton, SkeletonText } from '@/components/ds/Skeleton';
import type { HomeData } from '@/lib/home/types';
import { ActivityPreview } from './ActivityPreview';
import { AvailabilityCard } from './AvailabilityCard';
import { CoreStrip } from './CoreStrip';
import { DropsStrip } from './DropsStrip';
import { ExploreNearby } from './ExploreNearby';
import { Memories } from './Memories';
import { NewClicks } from './NewClicks';
import { OpportunityCard } from './OpportunityCard';
import { RecapCard } from './RecapCard';
import { UpcomingEvents } from './UpcomingEvents';

/** Main column + rail at lg; one column below, with rail modules slotted in (spec §7.1 mobile order). */
const GRID = 'flex flex-col gap-8 lg:grid lg:grid-cols-[minmax(0,680px)_320px] lg:items-start lg:justify-between lg:gap-10';
const MAIN = 'max-lg:contents lg:flex lg:min-w-0 lg:flex-col lg:gap-10';
const RAIL = 'max-lg:contents lg:sticky lg:top-[calc(var(--topbar-height)+24px)] lg:flex lg:flex-col lg:gap-8';

function Slot({ order, className, children }: { order: string; className?: string; children: ReactNode }) {
  return <div className={cn(order, 'min-w-0', className)}>{children}</div>;
}

export function HomeView({ data }: { data: HomeData }) {
  const { nowMs, timeZone } = data;
  return (
    <div className={GRID}>
      <div className={MAIN}>
        {data.opportunity ? (
          <Slot order="max-lg:order-1">
            <OpportunityCard opportunity={data.opportunity} timeZone={timeZone} nowMs={nowMs} />
          </Slot>
        ) : null}
        {data.newClicks.length > 1 ? (
          <Slot order="max-lg:order-3">
            <NewClicks items={data.newClicks} nowMs={nowMs} />
          </Slot>
        ) : null}
        {data.drops.enabled ? (
          <Slot order="max-lg:order-4">
            <DropsStrip items={data.drops.items} nowMs={nowMs} />
          </Slot>
        ) : null}
        <Slot order="max-lg:order-6">
          <UpcomingEvents events={data.upcoming} timeZone={timeZone} nowMs={nowMs} />
        </Slot>
        <Slot order="max-lg:order-7">
          <ExploreNearby />
        </Slot>
        {data.recap ? (
          <Slot order="max-lg:order-8">
            <RecapCard recap={data.recap} />
          </Slot>
        ) : null}
        {data.memories.length > 0 ? (
          <Slot order="max-lg:order-9">
            <Memories chapters={data.memories} />
          </Slot>
        ) : null}
      </div>
      <div className={RAIL} role="complementary" aria-label="Your circle">
        <Slot order="max-lg:order-2">
          <AvailabilityCard availability={data.availability} nowMs={nowMs} timeZone={timeZone} />
        </Slot>
        {data.core.length > 0 ? (
          <Slot order="max-lg:order-5">
            <CoreStrip people={data.core} />
          </Slot>
        ) : null}
        {/* On phones Activity lives behind the bell. */}
        <Slot order="max-lg:hidden">
          <ActivityPreview items={data.activityPreview} nowMs={nowMs} />
        </Slot>
      </div>
    </div>
  );
}

export function HomeSkeleton() {
  return (
    <div className={GRID} aria-busy aria-label="Loading Home">
      <div className="flex flex-col gap-10">
        <Skeleton rounded="lg" className="aspect-[16/9] w-full md:aspect-[16/5]" />
        <div className="flex flex-col gap-3">
          <Skeleton rounded="sm" className="h-5 w-40" />
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton rounded="md" className="size-16 shrink-0" />
              <SkeletonText lines={2} className="flex-1" />
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-3 max-lg:hidden">
        <Skeleton rounded="sm" className="h-5 w-32" />
        <Skeleton rounded="lg" className="h-28 w-full" />
      </div>
    </div>
  );
}
