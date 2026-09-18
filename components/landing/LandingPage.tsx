'use client';

import { ArrowRight, MapPin, Radar } from 'lucide-react';
import Image from 'next/image';
import dynamic from 'next/dynamic';
import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/AuthContext';
import FoldMapHero from '@/components/landing/fold-map/FoldMapHero';
import LandingPlaygroundLazy from '@/components/landing/playground/LandingPlaygroundLazy';
import {
  EMPTY_PRESENCE_HEATMAP,
  type PresenceHeatmapPayload,
} from '@/lib/landing/presenceHeatmap';
import { PAGE_COLUMN_CLASS } from '@/lib/shell/pageColumn';
import { cn } from '@/lib/cn';

const loadHomeAuthenticated = () => import('@/components/HomeAuthenticated');
const HomeAuthenticated = dynamic(loadHomeAuthenticated, { ssr: false });

const loadWaitlistModal = () => import('@/components/marketing/WaitlistModal');
const WaitlistModal = dynamic(loadWaitlistModal, { ssr: false });

function WaitlistLoadingShell({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[100000] flex items-center justify-center bg-on-surface/40 px-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="fc-card w-full max-w-md p-6"
        style={{ backgroundColor: 'var(--color-surface)' }}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="waitlist-title"
        aria-busy="true"
      >
        <h2 id="waitlist-title" className="text-2xl font-bold text-on-surface">
          Join the Waitlist
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-on-surface-variant">Loading…</p>
      </div>
    </div>
  );
}

/**
 * Marketing homepage. Never gates on auth `loading` so SSR/crawlers receive
 * indexable hero copy. After client login, swaps to the dashboard.
 */
export default function LandingPage({
  heatmap = EMPTY_PRESENCE_HEATMAP,
}: {
  heatmap?: PresenceHeatmapPayload;
}) {
  const { user } = useAuth();
  const router = useRouter();
  const [showWaitlist, setShowWaitlist] = useState(false);
  const pageRef = useRef<HTMLDivElement>(null);

  const prefetchWaitlist = () => {
    void loadWaitlistModal();
  };

  const openWaitlist = () => {
    prefetchWaitlist();
    setShowWaitlist(true);
  };

  useEffect(() => {
    if (user) {
      router.refresh();
    }
  }, [user, router]);

  useEffect(() => {
    const root = pageRef.current;
    if (!root) return;

    const sections = Array.from(
      root.querySelectorAll<HTMLElement>("[data-landing-reveal]"),
    );
    if (sections.length === 0) return;

    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion || typeof IntersectionObserver === "undefined") {
      sections.forEach((section) => {
        section.dataset.revealed = "true";
      });
      return;
    }

    const revealVisibleSections = () => {
      const threshold = window.innerHeight + 56;
      sections.forEach((section) => {
        if (section.getBoundingClientRect().top <= threshold) {
          section.dataset.revealed = "true";
        }
      });
    };

    revealVisibleSections();
    root.dataset.landingRevealReady = "true";

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const target = entry.target as HTMLElement;
          target.dataset.revealed = "true";
          observer.unobserve(target);
        });
      },
      { rootMargin: "0px 0px -56px 0px", threshold: 0.08 },
    );

    sections.forEach((section) => {
      if (section.dataset.revealed !== "true") observer.observe(section);
    });

    return () => observer.disconnect();
  }, []);

  if (user) {
    return <HomeAuthenticated user={user} />;
  }

  return (
    <>
      <div
        ref={pageRef}
        className="min-h-screen bg-background text-on-surface overflow-x-hidden isolate"
        style={{ fontFamily: 'var(--font-manrope), ui-sans-serif, system-ui, sans-serif' }}
      >
        <FoldMapHero
          onJoinWaitlist={openWaitlist}
          onPrefetchWaitlist={prefetchWaitlist}
          cells={heatmap.cells}
        />

        {showWaitlist ? (
          <Suspense fallback={<WaitlistLoadingShell onClose={() => setShowWaitlist(false)} />}>
            <WaitlistModal
              open
              onClose={() => setShowWaitlist(false)}
              source="homepage_hero"
            />
          </Suspense>
        ) : null}

        <div className={cn(PAGE_COLUMN_CLASS, 'space-y-8 pt-10 sm:space-y-12 sm:pt-14')}>
          <section data-landing-reveal id="why" className="grid items-center gap-10 overflow-hidden rounded-[32px] border-2 border-border-hard bg-surface-container px-6 py-12 sm:px-12 lg:grid-cols-2 lg:gap-16 lg:px-16" aria-labelledby="why-heading">
            <div className="flex justify-center">
              <Image
                src="/landing/consumer-add-click.png"
                alt="Click’s Add Click screen with Tap to Connect and QR sharing"
                width={472}
                height={1024}
                sizes="(max-width: 640px) 220px, 260px"
                className="h-auto w-[220px] rounded-[28px] border-2 border-border-hard sm:w-[260px]"
              />
            </div>
            <div className="max-w-md">
              <h2 id="why-heading" className="text-4xl font-extrabold uppercase leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">Connect<br />without<br />the noise.</h2>
              <p className="mt-6 max-w-sm text-base leading-relaxed text-on-surface-variant">Meet in person. Tap to connect. Keep the people you meet close, without another endless feed.</p>
              <a href="#how-it-works" className="fc-btn-primary mt-7 inline-flex min-h-11 items-center gap-3 px-6">See how it works <ArrowRight className="h-4 w-4" aria-hidden /></a>
            </div>
          </section>

          <section data-landing-reveal className="grid items-center gap-10 overflow-hidden rounded-[32px] border-2 border-primary bg-primary px-6 py-12 text-white sm:px-12 lg:grid-cols-2 lg:gap-16 lg:px-16" aria-labelledby="events-heading">
            <div className="flex justify-center py-2">
              <Image
                src="/landing/consumer-event-detail.png"
                alt="Click event details with a map, attendees, and Join Event Route"
                width={472}
                height={1024}
                sizes="(max-width: 640px) 220px, 260px"
                className="h-auto w-[220px] -rotate-3 rounded-[28px] border-2 border-white/30 sm:w-[260px]"
              />
            </div>
            <div className="max-w-md">
              <h2 id="events-heading" className="text-4xl font-extrabold uppercase leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">Discover<br />real events.</h2>
              <p className="mt-6 max-w-sm text-base leading-relaxed">Find your next gathering. See who’s going, bring your people, and show up together.</p>
              <Link href="/events" className="mt-7 inline-flex min-h-11 items-center gap-3 rounded-full border-2 border-white bg-white px-6 text-sm font-bold text-primary hover:bg-white/90"><MapPin className="h-4 w-4" aria-hidden />Explore events <ArrowRight className="h-4 w-4" aria-hidden /></Link>
            </div>
          </section>

          <section
            data-landing-reveal
            className="grid items-center gap-10 overflow-hidden rounded-[32px] border-2 border-primary/20 bg-[#f0e9ff] px-6 py-12 dark:bg-[#241a36] sm:px-12 lg:grid-cols-[1.15fr_1fr] lg:gap-16 lg:px-16"
            aria-labelledby="irl-heading"
          >
            <div className="relative mx-auto w-full max-w-md p-2 sm:p-3">
              <div className="absolute inset-0 -rotate-2 rounded-[28px] bg-primary/30" aria-hidden />
              <div className="relative overflow-hidden rounded-[16px] border-2 border-primary/40 bg-[#17151c]">
                <Image
                  src="/landing/vibe-radar-enhanced.png"
                  alt="Vibe Radar with nearby profiles arranged around concentric rings"
                  width={1484}
                  height={1060}
                  sizes="(max-width: 640px) 85vw, 448px"
                  className="h-auto w-full"
                />
              </div>
            </div>
            <div className="max-w-md">
              <h2 id="irl-heading" className="text-4xl font-extrabold uppercase leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
                IRL<br /><span className="text-primary">over URL.</span>
              </h2>
              <p className="mt-6 max-w-sm text-base leading-relaxed text-on-surface-variant">
                Your people are closer than you think. Find shared interests, make a connection, and take the conversation into the real world.
              </p>
              <a href="#how-it-works" className="fc-btn-primary mt-7 inline-flex min-h-11 items-center gap-3 px-6">
                <Radar className="h-4 w-4" aria-hidden />Explore Click<ArrowRight className="h-4 w-4" aria-hidden />
              </a>
            </div>
          </section>
        </div>

        <section
          data-landing-reveal
          id="how-it-works"
          className={cn(PAGE_COLUMN_CLASS, 'relative z-10 py-16 sm:py-20')}
          aria-labelledby="how-it-works-heading"
        >
          <div className="overflow-hidden rounded-[28px] border border-border-hard bg-surface p-4 shadow-sm sm:p-6 lg:p-8">
            <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Interactive demo</p>
                <h2
                  id="how-it-works-heading"
                  data-testid="landing-playground-heading"
                  className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl"
                >
                  Try Click before launch.
                </h2>
                <p className="mt-3 max-w-xl text-base text-on-surface-variant">
                  Connect with someone, RSVP to an event, then see how the same relationship carries into the companion dashboard.
                </p>
              </div>
              <p className="max-w-xs text-sm leading-relaxed text-on-surface-variant">
                Demo state is local to this page. Nothing here changes a real account.
              </p>
            </div>
            <LandingPlaygroundLazy />
          </div>
        </section>

        <section data-landing-reveal className={cn(PAGE_COLUMN_CLASS, 'relative z-10 pb-8')}>
          <p className="mx-auto max-w-2xl text-center text-sm text-on-surface-variant">
            Running a venue, campus, or event program?{' '}
            <Link href="/enterprise" className="font-semibold text-primary hover:text-primary/80">
              See Click for Business
            </Link>
            .
          </p>
        </section>

        <section data-landing-reveal className={cn(PAGE_COLUMN_CLASS, 'relative z-10 pb-24 pt-8')}>
          <div className="fc-card px-8 py-12 text-center">
            <h2 className="text-3xl font-bold tracking-tight text-on-surface sm:text-4xl">
              Click app launches Fall 2026.
            </h2>
            <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-on-surface-variant sm:text-base">
              No ads. No feed. Built at UW.
            </p>
            <button
              type="button"
              onClick={openWaitlist}
              onPointerEnter={prefetchWaitlist}
              onFocus={prefetchWaitlist}
              className="fc-btn-primary mt-8 h-11 px-8"
            >
              Join the Waitlist
            </button>
          </div>
        </section>
      </div>
    </>
  );
}
