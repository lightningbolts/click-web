'use client';

import { Suspense } from 'react';
import BusinessInsightsShell from '@/components/insights/BusinessInsightsShell';
import InsightsAccessGate from '@/components/insights/InsightsAccessGate';
import { InsightsDemoProvider } from '@/components/insights/InsightsDemoContext';
import { useSearchParams } from 'next/navigation';

function InsightsLayoutInner({ children }: { children: React.ReactNode }) {
  const searchParams = useSearchParams();
  const venueName = searchParams.get('venue') || 'My Venue';

  return (
    <InsightsDemoProvider>
      <BusinessInsightsShell venueName={venueName}>
        {children}
      </BusinessInsightsShell>
    </InsightsDemoProvider>
  );
}

function InsightsLoadingFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-on-surface">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-border-hard border-t-primary" />
    </div>
  );
}

/**
 * InsightsLayout — verified business only (InsightsAccessGate). Shell reads ?venue= for display name.
 */
export default function InsightsLayout({ children }: { children: React.ReactNode }) {
  return (
    <InsightsAccessGate>
      <Suspense fallback={<InsightsLoadingFallback />}>
        <InsightsLayoutInner>{children}</InsightsLayoutInner>
      </Suspense>
    </InsightsAccessGate>
  );
}
