'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { DEVICE_HEIGHT } from './layout';

/**
 * Keep the below-fold playground (two device previews and their state) out of the
 * anonymous `/` first paint. MapLibre is split again inside the playground.
 */
const LandingPlayground = dynamic(() => import('./LandingPlayground'), {
  ssr: false,
  loading: () => <PlaygroundSkeleton />,
});

/** Same footprint as the loaded playground (guide row, then the devices) so nothing jumps. */
function PlaygroundSkeleton() {
  return (
    <div className="flex flex-col gap-6" data-testid="landing-playground-loading" aria-busy="true" aria-label="Loading demo">
      <div className="flex gap-2 overflow-hidden">
        {[200, 220, 180, 170, 210].map((w) => (
          <div key={w} className="h-10 shrink-0 rounded-pill bg-fill-subtle" style={{ width: w }} />
        ))}
      </div>
      <div className="flex items-start gap-8">
        <div className={cn('mx-auto w-full max-w-[360px] rounded-device-frame bg-fill-subtle lg:mx-0 lg:w-[360px] lg:shrink-0', DEVICE_HEIGHT)} />
        <div className={cn('hidden flex-1 rounded-xl bg-fill-subtle lg:block', DEVICE_HEIGHT)} />
      </div>
    </div>
  );
}

export default function LandingPlaygroundLazy() {
  const ref = useRef<HTMLDivElement>(null);
  const [load, setLoad] = useState(false);

  useEffect(() => {
    if (load) return;
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setLoad(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setLoad(true);
          io.disconnect();
        }
      },
      { rootMargin: '240px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [load]);

  return <div ref={ref}>{load ? <LandingPlayground /> : <PlaygroundSkeleton />}</div>;
}
