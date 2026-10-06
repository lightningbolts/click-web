'use client';

import useSWR from 'swr';
import { BarChart3, Check } from 'lucide-react';
import { Button } from '@/components/ds/Button';
import { cardClassName } from '@/components/ds/Card';
import { RetryRow } from '@/components/ds/RetryRow';
import { Skeleton } from '@/components/ds/Skeleton';
import { StatTile } from '@/components/ds/StatTile';
import { authedJson } from '@/lib/api/authedJson';
import type { WorkspacePlace } from './PlaceWorkspaceContext';
import { placeBase } from './WorkspaceHeader';

type Summary = { totalConnections: number; retentionRate: number; busiestDay: string | null; peakHour: number | null };

/** What paid Insights adds; shown to free Places instead of fake or blurred data (spec §9.5). */
export const INSIGHTS_FEATURES = [
  '90-day and full stats',
  'Event engagement',
  'Network health',
  'Vibe Radar',
  'Crowd composition',
] as const;

export function InsightsExplainer({ place }: { place: Pick<WorkspacePlace, 'id' | 'role'> }) {
  return (
    <section aria-labelledby="insights-explainer" className={cardClassName({ className: 'flex flex-col gap-4' })}>
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-full bg-selection text-accent">
          <BarChart3 size={20} aria-hidden />
        </span>
        <h2 id="insights-explainer" className="type-headline text-fg">
          Insights with Click for Business
        </h2>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2">
        {INSIGHTS_FEATURES.map((f) => (
          <li key={f} className="type-body flex items-center gap-2 text-fg-secondary">
            <Check size={16} aria-hidden className="text-accent" />
            {f}
          </li>
        ))}
      </ul>
      <p className="type-meta text-fg-tertiary">Totals and distributions only. Every chart states how many people it covers.</p>
      <div>
        {place.role === 'owner' ? (
          <Button variant="primary" href={`${placeBase(place.id)}/billing`}>
            Upgrade this Place
          </Button>
        ) : (
          <p className="type-body-strong text-fg-secondary">Ask the owner to upgrade.</p>
        )}
      </div>
    </section>
  );
}

const DAY = new Intl.DateTimeFormat('en-US', { hour: 'numeric' });

/** 2–3 headline numbers from Insights for an entitled Place, with a way in. */
export function InsightsSummaryCard({ placeId }: { placeId: string }) {
  const { data, error, isLoading, mutate } = useSWR(`/api/insights/${placeId}`, (url: string) => authedJson<Summary>(url), {
    revalidateOnFocus: false,
  });
  return (
    <section aria-labelledby="insights-summary" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between px-1">
        <h2 id="insights-summary" className="type-headline text-fg">
          Insights
        </h2>
        <Button variant="plain" size="sm" href={`${placeBase(placeId)}/insights`}>
          Open Insights
        </Button>
      </div>
      {error ? (
        <RetryRow thing="Insights" onRetry={() => void mutate()} />
      ) : isLoading || !data ? (
        <div className="grid grid-cols-3 gap-3" aria-busy>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} rounded="lg" className="h-[84px]" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          <StatTile label="Clicks made here" value={data.totalConnections} hint="All time" />
          <StatTile label="Still talking" value={`${data.retentionRate}%`} hint={`n = ${data.totalConnections}`} />
          <StatTile
            label="Busiest"
            value={data.busiestDay ?? '—'}
            hint={data.peakHour != null ? `Around ${DAY.format(new Date(2026, 0, 1, data.peakHour))}` : undefined}
          />
        </div>
      )}
    </section>
  );
}
