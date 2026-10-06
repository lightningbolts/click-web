'use client';

import { ArrowRight, MapPin, Radar, Smartphone } from 'lucide-react';
import { IOS_TESTFLIGHT_URL } from '@/lib/config';
import Image from 'next/image';
import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
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


const loadWaitlistModal = () => import('@/components/marketing/WaitlistModal');
const WaitlistModal = dynamic(loadWaitlistModal, { ssr: false });

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
  /** Mounted once requested and kept mounted, so later opens and every close animate in place. */
  const [waitlistMounted, setWaitlistMounted] = useState(false);
  const pageRef = useRef<HTMLDivElement>(null);

  const prefetchWaitlist = () => {
    void loadWaitlistModal();
  };

  // Open only after the chunk is ready: no interim loading shell that the real dialog
  // replaces (that swap was the visible flash). Hover/focus prefetch makes this instant.
  const openWaitlist = () => {
    void loadWaitlistModal().then(() => {
      setWaitlistMounted(true);
      setShowWaitlist(true);
    });
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

  return (
    <>
      <div
        ref={pageRef}
        className="min-h-screen bg-bg text-fg overflow-x-clip isolate"
        style={{ fontFamily: 'var(--font-manrope), ui-sans-serif, system-ui, sans-serif' }}
      >
        <FoldMapHero
          onJoinWaitlist={openWaitlist}
          onPrefetchWaitlist={prefetchWaitlist}
          cells={heatmap.cells}
        />

        {waitlistMounted ? (
          <WaitlistModal
            open={showWaitlist}
            onClose={() => setShowWaitlist(false)}
            source="homepage_hero"
          />
        ) : null}

        <div className={cn(PAGE_COLUMN_CLASS, 'space-y-8 pt-10 sm:space-y-12 sm:pt-14')}>
          <section data-landing-reveal id="why" className="grid items-center gap-10 overflow-hidden rounded-[32px] border-2 border-hairline bg-surface-raised px-6 py-12 sm:px-12 lg:grid-cols-2 lg:gap-16 lg:px-16" aria-labelledby="why-heading">
            <div className="flex justify-center">
              <Image
                src="/landing/consumer-add-click.webp"
                alt="Click’s Add Click screen with Tap to Connect and QR sharing"
                width={560}
                height={1212}
                sizes="(max-width: 640px) 220px, 260px"
                className="h-auto w-[220px] rounded-[28px] border-2 border-hairline sm:w-[260px]"
              />
            </div>
            <div className="max-w-md">
              <h2 id="why-heading" className="text-4xl font-extrabold uppercase leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">Connect<br />without<br />the noise.</h2>
              <p className="mt-6 max-w-sm text-base leading-relaxed text-fg-secondary">Meet in person. Tap to connect. Keep the people you meet close, without another endless feed.</p>
              <a href="#how-it-works" className="fc-btn-primary mt-7 inline-flex min-h-11 items-center gap-3 px-6">See how it works <ArrowRight className="h-4 w-4" aria-hidden /></a>
            </div>
          </section>

          <section data-landing-reveal className="grid items-center gap-10 overflow-hidden rounded-[32px] border-2 border-action bg-action px-6 py-12 text-white sm:px-12 lg:grid-cols-2 lg:gap-16 lg:px-16" aria-labelledby="events-heading">
            <div className="flex justify-center py-2">
              <Image
                src="/landing/consumer-event-detail.webp"
                alt="Click event details with a map, attendees, and Join Event Route"
                width={560}
                height={1214}
                sizes="(max-width: 640px) 220px, 260px"
                className="h-auto w-[220px] -rotate-3 rounded-[28px] border-2 border-white/30 sm:w-[260px]"
              />
            </div>
            <div className="max-w-md">
              <h2 id="events-heading" className="text-4xl font-extrabold uppercase leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">Discover<br />real events.</h2>
              <p className="mt-6 max-w-sm text-base leading-relaxed">Find your next gathering. See who’s going, bring your people, and show up together.</p>
              <Link href="/events" className="mt-7 inline-flex min-h-11 items-center gap-3 rounded-full border-2 border-white bg-white px-6 text-sm font-bold text-accent hover:bg-white/90"><MapPin className="h-4 w-4" aria-hidden />Explore events <ArrowRight className="h-4 w-4" aria-hidden /></Link>
            </div>
          </section>

          <section
            data-landing-reveal
            className="grid items-center gap-10 overflow-hidden rounded-[32px] border-2 border-action/20 bg-[#f0e9ff] px-6 py-12 dark:bg-[#241a36] sm:px-12 lg:grid-cols-[1.15fr_1fr] lg:gap-16 lg:px-16"
            aria-labelledby="irl-heading"
          >
            <div className="flex justify-center py-2">
              <Image
                src="/landing/consumer-friend-profile.webp"
                alt="A friend’s profile in Click showing shared interests, a Close friendship level, and a map of the spots you’ve hung out"
                width={560}
                height={1213}
                sizes="(max-width: 640px) 220px, 260px"
                className="h-auto w-[220px] rotate-2 rounded-[28px] border-2 border-action/40 sm:w-[260px]"
              />
            </div>
            <div className="max-w-md">
              <h2 id="irl-heading" className="text-4xl font-extrabold uppercase leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
                IRL<br /><span className="text-accent">over URL.</span>
              </h2>
              <p className="mt-6 max-w-sm text-base leading-relaxed text-fg-secondary">
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
          <div className="overflow-hidden rounded-[28px] border border-hairline bg-surface p-4 shadow-sm sm:p-6 lg:p-8">
            <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent">Interactive demo</p>
                <h2
                  id="how-it-works-heading"
                  data-testid="landing-playground-heading"
                  className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl"
                >
                  Try Click in your browser.
                </h2>
                <p className="mt-3 max-w-xl text-base text-fg-secondary">
                  Connect with someone, RSVP to an event, then see how the same relationship carries into the companion dashboard.
                </p>
              </div>
              <p className="max-w-xs text-sm leading-relaxed text-fg-secondary">
                Demo state is local to this page. Nothing here changes a real account.
              </p>
            </div>
            <LandingPlaygroundLazy />
          </div>
        </section>

        <section data-landing-reveal className={cn(PAGE_COLUMN_CLASS, 'relative z-10 pb-8')}>
          <p className="mx-auto max-w-2xl text-center text-sm text-fg-secondary">
            Running a venue, campus, or event program?{' '}
            <Link href="/enterprise" className="font-semibold text-accent hover:text-accent/80">
              See Click for Business
            </Link>
            .
          </p>
        </section>

        <section data-landing-reveal className={cn(PAGE_COLUMN_CLASS, 'relative z-10 pb-24 pt-8')}>
          <div className="fc-card px-8 py-12 text-center">
            <h2 className="text-3xl font-bold tracking-tight text-fg sm:text-4xl">
              The Click beta is live on iPhone.
            </h2>
            <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-fg-secondary sm:text-base">
              Install TestFlight, tap the invite, and start connecting. Android coming soon. Full launch Fall 2026. No ads. No feed. Built at UW.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <a
                href={IOS_TESTFLIGHT_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="fc-btn-primary inline-flex h-11 items-center gap-2 px-8"
              >
                <Smartphone className="h-4 w-4" aria-hidden />
                Get the iOS beta
              </a>
              <button
                type="button"
                onClick={openWaitlist}
                onPointerEnter={prefetchWaitlist}
                onFocus={prefetchWaitlist}
                className="h-11 rounded-[8px] border border-hairline bg-surface px-8 text-sm font-bold text-fg hover:border-action hover:text-accent"
              >
                Join the Waitlist
              </button>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
