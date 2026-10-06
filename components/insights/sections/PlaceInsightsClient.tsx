'use client';

import useSWR from 'swr';
import { useInsightsDemo } from '@/components/insights/InsightsDemoContext';
import { RetryRow } from '@/components/ds/RetryRow';
import { Skeleton } from '@/components/ds/Skeleton';
import PlaceStatsView from '@/components/places/PlaceStatsView';
import { fetchInsightsApiJson } from '@/lib/insights/fetchInsightsApi';
import { mockPlaceStats } from '@/lib/insights/mockData';
import type { PlaceStats } from '@/lib/server/places/stats';

const fetcher = (url: string) => fetchInsightsApiJson<PlaceStats>(url);

/** Click Places trends for this Place (spec §9.5 Insights › Overview): counts only, each with n. */
export default function PlaceInsightsClient({ placeId, range = 90 }: { placeId: string; range?: 30 | 90 }) {
  const { demoMode } = useInsightsDemo();
  const { data, error, isLoading, mutate } = useSWR<PlaceStats>(
    `/api/places/${encodeURIComponent(placeId)}/stats?range=${range}d&detail=full`,
    fetcher,
  );
  const stats: PlaceStats | null = demoMode ? (mockPlaceStats as PlaceStats) : (data ?? null);

  if (stats) return <PlaceStatsView stats={stats} />;
  if (isLoading) return <Skeleton rounded="lg" className="h-72" />;
  if (error) return <RetryRow thing="Place stats" onRetry={() => void mutate()} />;
  return null;
}
