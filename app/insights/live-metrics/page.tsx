'use client';

import dynamic from 'next/dynamic';

const LiveMetricsClient = dynamic(() => import('./LiveMetricsClient'), {
  ssr: false,
});

export default function LiveMetricsPage() {
  return <LiveMetricsClient />;
}