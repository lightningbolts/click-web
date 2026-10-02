'use client';

import dynamic from 'next/dynamic';

const PlaceInsightsClient = dynamic(() => import('./PlaceInsightsClient'), {
  ssr: false,
});

export default function PlaceInsightsPage() {
  return <PlaceInsightsClient />;
}
