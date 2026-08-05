'use client';

import dynamic from 'next/dynamic';

const InsightsDashboard = dynamic(
  () => import('@/components/insights/InsightsDashboard'),
  { ssr: false },
);

/**
 * InsightsPage - Overview landing for the Business Insights dashboard.
 * Shell/nav is provided by app/insights/layout.tsx.
 * Client-only to keep recharts/maplibre out of the Cloudflare Worker bundle.
 */
export default function InsightsPage() {
  return <InsightsDashboard />;
}