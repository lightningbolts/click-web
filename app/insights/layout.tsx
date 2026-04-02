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
    <div className="min-h-screen bg-[#121212] text-white flex items-center justify-center">
      <div className="h-10 w-10 rounded-full border-2 border-[#8338EC]/30 border-t-[#8338EC] animate-spin" />
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
