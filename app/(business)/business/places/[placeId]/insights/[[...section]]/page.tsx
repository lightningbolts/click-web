import type { Metadata } from 'next';
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { InsightsExplainer } from '@/components/business/InsightsSummaryCard';
import { InsightsNav, InsightsSectionView } from '@/components/business/InsightsSections';
import { UrlSegmented } from '@/components/business/UrlSegmented';
import { InlineNotice } from '@/components/ds/InlineNotice';
import { INSIGHTS_SECTIONS, type InsightsSection } from '@/lib/places/workspace';
import { loadWorkspace, toWorkspacePlace } from '@/lib/server/places/workspace';

type Params = Promise<{ placeId: string; section?: string[] }>;
type SearchParams = Promise<{ range?: string; demo?: string }>;
type Range = '90d' | '30d';

export const metadata: Metadata = { title: 'Insights · Business · Click', robots: { index: false } };

function parseSection(segments: string[] | undefined): InsightsSection | null {
  if (!segments || segments.length === 0) return 'overview';
  if (segments.length > 1) return null;
  return (INSIGHTS_SECTIONS as readonly string[]).includes(segments[0]) ? (segments[0] as InsightsSection) : null;
}

/**
 * Insights, a tab of the Place (spec §9.5): Overview / Traffic / Crowd / Vibe / Events for the
 * Place in the URL only. Free Places see what Insights adds instead of fake data.
 */
export default async function PlaceInsightsPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const [{ placeId, section: segments }, sp] = await Promise.all([params, searchParams]);
  const section = parseSection(segments);
  if (!section) notFound();
  const ws = await loadWorkspace(placeId);
  if (ws.kind !== 'ok') notFound();
  const place = toWorkspacePlace(ws.place);
  if (!place.entitled) return <div className="max-w-[720px]"><InsightsExplainer place={place} /></div>;

  const demo = sp.demo === '1';
  // The Places stats API supports 30 and 90 days; the other charts cover all time.
  const range: Range = sp.range === '30d' ? '30d' : '90d';
  const query = new URLSearchParams({ ...(range === '30d' ? { range } : {}), ...(demo ? { demo: '1' } : {}) }).toString();

  return (
    <div className="flex flex-col gap-6 xl:flex-row xl:gap-10">
      <InsightsNav placeId={place.id} section={section} query={query ? `?${query}` : ''} />
      <div className="min-w-0 flex-1">
        {demo ? (
          <InlineNotice variant="warning" className="mb-6">
            Demo data. These numbers are samples, not this Place.
          </InlineNotice>
        ) : null}
        {section === 'overview' ? (
          <div className="mb-6">
            <Suspense>
              <UrlSegmented<Range>
                param="range"
                value={range}
                label="Range"
                size="sm"
                segments={[
                  { value: '90d', label: '90 days' },
                  { value: '30d', label: '30 days' },
                ]}
              />
            </Suspense>
          </div>
        ) : null}
        <InsightsSectionView placeId={place.id} section={section} demo={demo} range={range === '30d' ? 30 : 90} />
      </div>
    </div>
  );
}
