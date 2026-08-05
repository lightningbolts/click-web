'use client';

import dynamic from 'next/dynamic';

const EventEngagementClient = dynamic(() => import('./EventEngagementClient'), {
  ssr: false,
});

export default function EventEngagementPage() {
  return <EventEngagementClient />;
}