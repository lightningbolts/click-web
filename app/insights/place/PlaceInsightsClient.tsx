'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import { FcCard, FcPageShell, FcSectionHeader } from '@/components/fc';
import { useInsightsDemo } from '@/components/insights/InsightsDemoContext';
import PlaceStatsView from '@/components/places/PlaceStatsView';
import { useAuth } from '@/lib/AuthContext';
import { fetchInsightsApiJson } from '@/lib/insights/fetchInsightsApi';
import { mockPlaceStats } from '@/lib/insights/mockData';
import type { PlaceStats } from '@/lib/server/places/stats';

const fetcher = (url: string) => fetchInsightsApiJson<PlaceStats>(url);

/** /insights/place — 90-day Click Places trends for Click for Business (§7.3). */
export default function PlaceInsightsClient() {
  const { user } = useAuth();
  const { demoMode } = useInsightsDemo();
  const venueId = useSearchParams().get('venue_id')?.trim() || null;
  const url = venueId ? `/api/places/${encodeURIComponent(venueId)}/stats?range=90d&detail=full` : null;
  const { data, error, isLoading } = useSWR<PlaceStats>(user && url ? url : null, fetcher);
  const status = (error as { status?: number } | undefined)?.status;

  const stats: PlaceStats | null = data ?? (demoMode ? (mockPlaceStats as PlaceStats) : null);

  return (
    <FcPageShell className="bg-transparent">
      <FcSectionHeader
        title="Place"
        subtitle="Check-ins, Pulse and connections at your Click Place. Anonymous counts only; every chart shows its n."
      />
      {stats ? (
        <PlaceStatsView stats={stats} />
      ) : isLoading ? (
        <p className="text-sm text-on-surface-variant">Loading…</p>
      ) : status === 402 ? (
        <FcCard className="p-6 text-sm text-on-surface">Full Place stats are part of Click for Business.</FcCard>
      ) : (
        <FcCard className="space-y-2 p-6">
          <p className="text-sm font-semibold text-on-surface">This venue isn&apos;t a Click Place yet.</p>
          <p className="text-sm text-on-surface-variant">
            Click Places is invite-only during the pilot.{' '}
            <Link href="/business/places" className="font-semibold text-primary hover:underline">
              Manage Places
            </Link>
          </p>
        </FcCard>
      )}
    </FcPageShell>
  );
}
