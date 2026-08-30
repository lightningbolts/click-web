'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';

/**
 * Keep the below-fold playground (framer-motion + scene graph) out of the
 * anonymous `/` first paint. MapLibre is split again inside the playground.
 */
const LandingPlayground = dynamic(() => import('./LandingPlayground'), {
  ssr: false,
  loading: () => <PlaygroundSkeleton />,
});

function PlaygroundSkeleton() {
  return (
    <div
      className="w-full"
      data-testid="landing-playground-loading"
      aria-busy="true"
      aria-label="Loading product tour"
    >
      <div className="mb-6 flex flex-wrap justify-center gap-2">
        <div className="h-9 w-20 rounded-full border border-border-hard bg-surface" />
        <div className="h-9 w-20 rounded-full border border-border-hard bg-surface" />
        <div className="h-9 w-24 rounded-full border border-border-hard bg-surface" />
      </div>
      <div className="flex flex-col gap-6 lg:flex-row lg:items-stretch">
        <div className="h-[560px] min-w-0 flex-1 rounded-[16px] border border-border-hard bg-surface lg:h-[640px]" />
        <div className="h-[240px] w-full rounded-[16px] border border-border-hard bg-surface lg:h-[640px] lg:max-w-sm" />
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
