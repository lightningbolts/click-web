'use client';

import Image from 'next/image';
import { useReducedMotion } from 'framer-motion';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { LANDING_IMG } from '@/lib/landingAssets';

const Y_TILT_DEG = [10, -10] as const;

const slides = [
  {
    src: LANDING_IMG.groupChat,
    alt: 'Click mobile — Verified group chat with messages and shared photo',
    label: 'Group chat',
    width: 472,
    height: 1024,
    orientation: 'portrait' as const,
  },
  {
    src: LANDING_IMG.mapWeb,
    alt: 'Click web — Map with connection pins, layer toggles, and campus context',
    label: 'Click Map',
    width: 1024,
    height: 626,
    orientation: 'landscape' as const,
  },
] as const;

const carouselHeightClassName =
  'h-[min(68vh,520px)] sm:h-[min(70vh,580px)] md:h-[min(72vh,640px)] lg:h-[min(74vh,720px)] xl:h-[min(76vh,800px)]';

function SlideImage({
  slide,
  priority = false,
}: {
  slide: (typeof slides)[number];
  priority?: boolean;
}) {
  const isPortrait = slide.orientation === 'portrait';

  return (
    <div
      className={
        isPortrait
          ? 'relative mx-auto flex h-full max-h-full w-auto max-w-[min(100%,280px)] items-center justify-center sm:max-w-[min(100%,300px)] md:max-w-[min(100%,320px)]'
          : 'relative mx-auto flex h-full max-h-full w-full max-w-[min(100%,1040px)] items-center justify-center'
      }
    >
      {/*
        Intrinsic width/height + CSS max constraints (not `fill` in a mismatched aspect box)
        so landscape and portrait both stay sharp inside the shared carousel viewport.
      */}
      <Image
        src={slide.src}
        alt={slide.alt}
        width={slide.width}
        height={slide.height}
        priority={priority}
        quality={92}
        sizes={
          isPortrait
            ? '(max-width: 640px) 55vw, (max-width: 1024px) 300px, 320px'
            : '(max-width: 768px) 92vw, (max-width: 1280px) 90vw, 1040px'
        }
        className={
          isPortrait
            ? 'h-full w-auto max-h-full max-w-full object-contain'
            : 'h-auto max-h-full w-full object-contain'
        }
      />
    </div>
  );
}

export default function LandingWebScreensCarousel() {
  const reduceMotion = useReducedMotion();
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollRafRef = useRef<number | null>(null);
  const activeIndexRef = useRef(0);
  const [active, setActive] = useState(0);

  const syncActiveFromScrollPosition = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const h = el.clientHeight;
    if (h <= 0) return;
    const idx = Math.round(el.scrollTop / h);
    const clamped = Math.min(Math.max(idx, 0), slides.length - 1);
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

    const onScroll = () => scheduleSyncFromScroll();
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
    const ro = new ResizeObserver(() => syncActiveFromScrollPosition());
    ro.observe(el);
    return () => ro.disconnect();
  }, [syncActiveFromScrollPosition]);

  const scrollBySlide = (dir: -1 | 1) => {
    const el = scrollRef.current;
    if (!el) return;
    const h = el.clientHeight;
    const current = Math.round(el.scrollTop / h);
    const next = Math.min(Math.max(current + dir, 0), slides.length - 1);
    el.scrollTo({ top: next * h, behavior: reduceMotion ? 'auto' : 'smooth' });
  };

  const stacked = (
    <div className="flex flex-col gap-5">
      {slides.map((p, i) => (
        <div
          key={p.src}
          className="overflow-hidden rounded-2xl border border-border-hard bg-background/80 p-3 sm:p-4"
          style={{
            transform: `perspective(1200px) rotateY(${Y_TILT_DEG[i]}deg)`,
            transformStyle: 'preserve-3d',
          }}
        >
          <div
            className={
              p.orientation === 'portrait'
                ? 'mx-auto flex h-[min(70vh,640px)] justify-center'
                : 'flex w-full justify-center'
            }
          >
            <SlideImage slide={p} />
          </div>
        </div>
      ))}
    </div>
  );

  if (reduceMotion) {
    return <div className="relative mt-8 w-full">{stacked}</div>;
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
          {slides.map((p, i) => (
            <div
              key={p.src}
              className="flex h-full min-h-0 w-full shrink-0 snap-start snap-always items-center justify-center px-3 py-4 sm:px-6 md:px-8"
            >
              <div className="flex h-full min-h-0 w-full max-w-[min(100%,1120px)] origin-center items-center justify-center [perspective:1400px]">
                <div
                  className="flex h-full max-h-full min-h-0 w-full items-center justify-center overflow-hidden rounded-xl border border-white/12 bg-surface-container/60 p-2 shadow-[0_32px_90px_-24px_rgba(131,56,236,0.35)] sm:p-3"
                  style={{
                    transform: `rotateY(${Y_TILT_DEG[i]}deg)`,
                    transformStyle: 'preserve-3d',
                  }}
                >
                  <SlideImage slide={p} priority={i === 0} />
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-between gap-2 bg-gradient-to-t from-zinc-950/95 via-zinc-950/70 to-transparent pb-3 pt-12 pl-3 pr-3 md:pl-5 md:pr-5">
          <div className="pointer-events-auto flex w-full items-end justify-between gap-3">
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] font-medium uppercase tracking-wider text-on-surface-variant">
                {slides[active]?.label ?? 'Screens'}
              </span>
              <div className="flex gap-1.5">
                {slides.map((p, i) => (
                  <button
                    key={p.src}
                    type="button"
                    aria-label={`Show ${p.label}`}
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
                disabled={active === slides.length - 1}
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
        Scroll or use arrows to browse · {active + 1} / {slides.length}
      </p>
    </div>
  );
}
