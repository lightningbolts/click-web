'use client';

import { Suspense } from 'react';
import dynamic from 'next/dynamic';
import type { User } from '@supabase/supabase-js';
import LoadingScreen from '@/components/LoadingScreen';

/** Keep livekit/maplibre/emoji-mart out of the Cloudflare Worker SSR bundle. */
const DashboardView = dynamic(() => import('@/components/DashboardView'), {
  ssr: false,
  loading: () => <LoadingScreen />,
});

export default function HomeAuthenticated({ user }: { user: User }) {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <DashboardView user={user} />
    </Suspense>
  );
}
