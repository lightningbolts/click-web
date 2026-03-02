'use client';

import BusinessInsightsShell from '@/components/insights/BusinessInsightsShell';
import { useSearchParams } from 'next/navigation';

/**
 * InsightsLayout — wraps all /insights/* pages with the business sub-navigation shell.
 * Reads venue name from ?venue= query param, falling back to a default.
 */
export default function InsightsLayout({ children }: { children: React.ReactNode }) {
  const searchParams = useSearchParams();
  const venueName = searchParams.get('venue') || 'My Venue';

  return (
    <BusinessInsightsShell venueName={venueName}>
      {children}
    </BusinessInsightsShell>
  );
}
