'use client';

import { Suspense, useCallback, useState } from 'react';
import dynamic from 'next/dynamic';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import type { User } from '@supabase/supabase-js';
import LoadingScreen from '@/components/LoadingScreen';
import { ProductChromeOn } from '@/lib/shell/ProductChromeContext';
import { fadeTransition } from '@/lib/motion';
import { readSessionCache } from '@/lib/dashboard/sessionCache';

/** Keep livekit/maplibre/emoji-mart out of the Cloudflare Worker SSR bundle. */
const DashboardView = dynamic(() => import('@/components/DashboardView'), {
  ssr: false,
  loading: () => null,
});

export default function HomeAuthenticated({ user }: { user: User }) {
  // Returning to `/` in the same tab session paints the cached dashboard, not the boot loader.
  const [ready, setReady] = useState(() => readSessionCache<boolean>(user.id, 'booted') === true);
  const reduceMotion = useReducedMotion();
  const onReady = useCallback(() => setReady(true), []);

  return (
    <>
      <ProductChromeOn />
      <AnimatePresence>
        {ready ? null : (
          <motion.div
            key="boot-loader"
            // Overlay, not in flow: while it fades out the dashboard is already in place beneath it.
            className="fixed inset-x-0 bottom-0 top-[var(--navbar-height)] z-40"
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
