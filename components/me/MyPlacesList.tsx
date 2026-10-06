'use client';

import useSWR from 'swr';
import { Building2 } from 'lucide-react';
import { CardVisual } from '@/components/ds/CardVisual';
import { EmptyState } from '@/components/ds/EmptyState';
import { ListGroup, ListRow } from '@/components/ds/ListGroup';
import { RetryRow } from '@/components/ds/RetryRow';
import { Skeleton } from '@/components/ds/Skeleton';
import { authedJson } from '@/lib/api/authedJson';
import { categoryLabel } from '@/lib/places/categories';
import type { PlaceSummary } from '@/lib/places/types';

type Row = { place: PlaceSummary; check_in_count: number; last_check_in_at: string | null; encounter_count: number };

export function placeVisitLine(r: Pick<Row, 'check_in_count' | 'encounter_count'>): string {
  const parts: string[] = [];
  if (r.check_in_count > 0) parts.push(`${r.check_in_count} ${r.check_in_count === 1 ? 'check-in' : 'check-ins'}`);
  if (r.encounter_count > 0) parts.push(`${r.encounter_count} ${r.encounter_count === 1 ? 'Click' : 'Clicks'} here`);
  return parts.join(' · ');
}

/** Places you've checked in at or Clicked at in the last 90 days (private to you). */
export function MyPlacesList() {
  const { data, error, isLoading, mutate } = useSWR('/api/me/places', (url: string) => authedJson<{ places: Row[] }>(url), {
    revalidateOnFocus: false,
  });
  if (isLoading && !data) {
    return (
      <div aria-busy className="flex flex-col gap-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} rounded="lg" className="h-16" />
        ))}
      </div>
    );
  }
  if (error) return <RetryRow thing="your Places" onRetry={() => void mutate()} />;
  const rows = data?.places ?? [];
  if (rows.length === 0) {
    return <EmptyState icon={Building2} title="No Places yet" body="Places you check in at, or Click at, show up here. Only you can see this." />;
  }
  return (
    <ListGroup footer="Last 90 days. Only you can see this.">
      {rows.map((r) => (
        <ListRow
          key={r.place.id}
          href={`/p/${r.place.slug}`}
          leading={<CardVisual seed={r.place.id} photoUrl={r.place.photo_url} radius="sm" className="size-10" sizes="40px" />}
          title={r.place.name}
          subtitle={[categoryLabel(r.place.category), placeVisitLine(r)].filter(Boolean).join(' · ')}
          chevron
        />
      ))}
    </ListGroup>
  );
}
