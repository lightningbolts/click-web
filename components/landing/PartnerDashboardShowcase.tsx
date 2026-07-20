'use client';

import Image from 'next/image';
import { useReducedMotion } from 'framer-motion';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { LANDING_IMG } from '@/lib/landingAssets';

/** Y-axis tilt for each screenshot (Event engagement, Vibe Stream, Tribe Analysis, Heatmap). */
const PANEL_ANGLES_DEG = [15, 8, -8, -15] as const;

const panels = [
  {
    src: LANDING_IMG.partnerEventEngagement,
    alt: 'Click Insights — Event engagement funnel from impressions to check-ins',
  },
  {
    src: LANDING_IMG.partnerVibeStream,
    alt: 'Click Insights — Vibe Stream sentiment and feedback analytics',
  },
  {
    src: LANDING_IMG.partnerTribeAnalysis,
    alt: 'Click Insights — Tribe Analysis dashboard with community clusters',
  },
  {
    src: LANDING_IMG.partnerHeatmap,
    alt: 'Click Insights — Spatial heatmap for venue zones',
  },
];

export default function PartnerDashboardShowcase() {
  const reduceMotion = useReducedMotion();
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollRafRef = useRef<number | null>(null);
  const activeIndexRef = useRef(0);
  const [active, setActive] = useState(0);

  const carouselHeightClassName =
    'h-[min(70vh,520px)] sm:h-[min(72vh,580px)] md:h-[min(76vh,680px)] lg:h-[min(78vh,760px)] xl:h-[min(80vh,860px)] 2xl:h-[min(82vh,920px)]';

  const syncActiveFromScrollPosition = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const h = el.clientHeight;
    if (h <= 0) return;
    const idx = Math.round(el.scrollTop / h);
    const clamped = Math.min(Math.max(idx, 0), panels.length - 1);
    if (clamped !== activeIndexRef.current) {
      activeIndexRef.current = clamped;
      setActive(clamped);
    }
  }, []);

  const scheduleSyncFromScroll = useCallback(() => {
    if (scrollRafRef.current != null) return;
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null;
      syncActiveFromScrollPosition();
    });
  }, [syncActiveFromScrollPosition]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const onScroll = () => {
      scheduleSyncFromScroll();
    };

    const onScrollEnd = () => {
      if (scrollRafRef.current != null) {
        cancelAnimationFrame(scrollRafRef.current);
        scrollRafRef.current = null;
      }
      syncActiveFromScrollPosition();
    };

    syncActiveFromScrollPosition();
    el.addEventListener('scroll', onScroll, { passive: true });
    el.addEventListener('scrollend', onScrollEnd);

    return () => {
      el.removeEventListener('scroll', onScroll);
      el.removeEventListener('scrollend', onScrollEnd);
      if (scrollRafRef.current != null) cancelAnimationFrame(scrollRafRef.current);
    };
  }, [scheduleSyncFromScroll, syncActiveFromScrollPosition]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      syncActiveFromScrollPosition();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [syncActiveFromScrollPosition]);

  const scrollBySlide = (dir: -1 | 1) => {
    const el = scrollRef.current;
    if (!el) return;
    const h = el.clientHeight;
    const current = Math.round(el.scrollTop / h);
    const next = Math.min(Math.max(current + dir, 0), panels.length - 1);
    el.scrollTo({ top: next * h, behavior: reduceMotion ? 'auto' : 'smooth' });
  };

  const stackedPanels = (
    <div className="flex flex-col gap-5">
      {panels.map((p, i) => (
        <div
          key={p.src}
          className="overflow-hidden rounded-2xl border border-border-hard bg-background/80"
          style={{
            transform: `perspective(1200px) rotateY(${PANEL_ANGLES_DEG[i]}deg)`,
            transformStyle: 'preserve-3d',
          }}
        >
          <div className="relative aspect-[16/10] w-full">
            <Image
              src={p.src}
              alt={p.alt}
              fill
              sizes="(max-width: 768px) min(100vw, 560px), 960px"
              className="object-contain object-top"
            />
          </div>
        </div>
      ))}
    </div>
  );

  if (reduceMotion) {
    return <div className="relative mt-8 w-full">{stackedPanels}</div>;
  }

  return (
    <div className="relative mt-8 w-full min-w-0">
      <div
        className={`relative w-full overflow-hidden rounded-2xl border border-border-hard bg-background/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] ${carouselHeightClassName}`}
      >
        <div
          ref={scrollRef}
          className="h-full w-full snap-y snap-mandatory overflow-y-auto overscroll-y-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {panels.map((p, i) => (
            <div
              key={p.src}
              className="flex h-full min-h-0 w-full shrink-0 snap-start snap-always items-center justify-center px-2 py-3 sm:px-6 md:px-8"
            >
              <div className="w-full max-w-[min(100%,1120px)] origin-center [perspective:1400px]">
                <div
                  className="overflow-hidden rounded-xl border border-white/12 bg-surface-container/60 shadow-[0_32px_90px_-24px_rgba(131,56,236,0.35)]"
                  style={{
                    transform: `rotateY(${PANEL_ANGLES_DEG[i]}deg)`,
                    transformStyle: 'preserve-3d',
                  }}
                >
                  <div className="relative aspect-[16/10] w-full">
                    <Image
                      src={p.src}
                      alt={p.alt}
                      fill
                      sizes="(max-width: 768px) min(100vw, 1120px), 1120px"
                      className="object-contain object-top"
                      priority={i === 0}
                    />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Controls */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-between gap-2 bg-gradient-to-t from-zinc-950/95 via-zinc-950/70 to-transparent pb-3 pt-12 pl-3 pr-3 md:pl-5 md:pr-5">
          <div className="pointer-events-auto flex w-full items-end justify-between gap-3">
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] font-medium uppercase tracking-wider text-on-surface-variant">
                Partner insights
              </span>
              <div className="flex gap-1.5">
                {panels.map((p, i) => (
                  <button
                    key={p.src}
                    type="button"
                    aria-label={`Show slide ${i + 1}`}
                    onClick={() => {
                      const el = scrollRef.current;
                      if (!el) return;
                      el.scrollTo({
                        top: i * el.clientHeight,
                        behavior: reduceMotion ? 'auto' : 'smooth',
                      });
                    }}
                    className={`h-2 rounded-full transition-all ${
                      active === i ? 'w-8 bg-[#630ed4]' : 'w-2 bg-zinc-600 hover:bg-zinc-500'
                    }`}
                  />
                ))}
              </div>
            </div>
            <div className="pointer-events-auto flex flex-col gap-1">
              <button
                type="button"
                aria-label="Previous slide"
                disabled={active === 0}
                onClick={() => scrollBySlide(-1)}
                className="rounded-xl border border-border-hard bg-surface-container/90 p-2 text-on-surface shadow-lg transition hover:border-[#630ed4]/40 hover:text-on-surface disabled:cursor-not-allowed disabled:opacity-35"
              >
                <ChevronUp className="h-5 w-5" aria-hidden />
              </button>
              <button
                type="button"
                aria-label="Next slide"
                disabled={active === panels.length - 1}
                onClick={() => scrollBySlide(1)}
                className="rounded-xl border border-border-hard bg-surface-container/90 p-2 text-on-surface shadow-lg transition hover:border-[#630ed4]/40 hover:text-on-surface disabled:cursor-not-allowed disabled:opacity-35"
              >
                <ChevronDown className="h-5 w-5" aria-hidden />
              </button>
            </div>
          </div>
        </div>
      </div>
      <p className="mt-3 text-center text-xs text-on-surface-variant">
        Scroll or use arrows to browse · {active + 1} / {panels.length}
      </p>
    </div>
  );
}
