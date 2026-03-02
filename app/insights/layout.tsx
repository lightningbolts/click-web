'use client';

import { Suspense } from 'react';
import BusinessInsightsShell from '@/components/insights/BusinessInsightsShell';
import { useSearchParams } from 'next/navigation';

function InsightsLayoutInner({ children }: { children: React.ReactNode }) {
  const searchParams = useSearchParams();
  const venueName = searchParams.get('venue') || 'My Venue';

  return (
    <BusinessInsightsShell venueName={venueName}>
      {children}
    </BusinessInsightsShell>
  );
}

/**
 * InsightsLayout — wraps all /insights/* pages with the business sub-navigation shell.
 * Reads venue name from ?venue= query param, falling back to a default.
 */
export default function InsightsLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={
      <BusinessInsightsShell venueName="Loading...">
        {children}
      </BusinessInsightsShell>
    }>
      <InsightsLayoutInner>{children}</InsightsLayoutInner>
    </Suspense>
  );
}
