'use client';

import { Suspense, useCallback, useState } from 'react';
import dynamic from 'next/dynamic';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import type { User } from '@supabase/supabase-js';
import LoadingScreen from '@/components/LoadingScreen';
import { ProductChromeOn } from '@/lib/shell/ProductChromeContext';
import { fadeTransition } from '@/lib/motion';

/** Keep livekit/maplibre/emoji-mart out of the Cloudflare Worker SSR bundle. */
const DashboardView = dynamic(() => import('@/components/DashboardView'), {
  ssr: false,
  loading: () => null,
});

export default function HomeAuthenticated({ user }: { user: User }) {
  const [ready, setReady] = useState(false);
  const reduceMotion = useReducedMotion();
  const onReady = useCallback(() => setReady(true), []);

  return (
    <>
      <ProductChromeOn />
      <AnimatePresence>
        {ready ? null : (
          <motion.div
            key="boot-loader"
            className="min-h-[calc(100dvh-var(--navbar-height))]"
            exit={reduceMotion ? undefined : { opacity: 0 }}
            transition={fadeTransition(0.22)}
          >
            <LoadingScreen />
          </motion.div>
        )}
      </AnimatePresence>
      <Suspense fallback={null}>
        <DashboardView user={user} onReady={onReady} />
      </Suspense>
    </>
  );
}
