'use client';

import { CheckCircle, MapPin, Smartphone } from 'lucide-react';
import dynamic from 'next/dynamic';
import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/AuthContext';
import FoldMapHero from '@/components/landing/fold-map/FoldMapHero';
import LandingPlaygroundLazy from '@/components/landing/playground/LandingPlaygroundLazy';
import { EMPTY_PRESENCE_HEATMAP, type PresenceHeatmapPayload } from '@/lib/landing/presenceHeatmap';
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

  if (user) {
    return <HomeAuthenticated user={user} />;
  }

  return (
    <>
      <div className="min-h-screen bg-background text-on-surface overflow-x-hidden isolate">
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

        <section id="why" className={cn(PAGE_COLUMN_CLASS, "relative z-10 pb-8 pt-16")} aria-labelledby="why-heading">
          <div>
            <h2 id="why-heading" className="text-center text-3xl font-bold tracking-tight sm:text-4xl">
              Why Click exists
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-center text-base leading-relaxed text-on-surface-variant">
              You&apos;ve had that conversation at a party, a class, a show, the kind where you think,{' '}
              <span className="font-semibold text-primary">I should actually know this person</span>. Then you follow
              each other and it evaporates. Pretty soon they&apos;re just another handle in the same endless scroll.
            </p>
            <div className="mt-8 grid gap-4 md:grid-cols-2">
              <div className="fc-card p-5">
                <h3 className="font-bold text-on-surface">The follow-back void</h3>
                <p className="mt-2 text-sm leading-relaxed text-on-surface-variant">
                  You follow. They follow back. Neither of you ever sends a message.
                </p>
              </div>
              <div className="fc-card p-5">
                <h3 className="font-bold text-on-surface">The handle handoff</h3>
                <p className="mt-2 text-sm leading-relaxed text-on-surface-variant">
                  You hunt for the right app, guess at spelling, and the person in front of you is already across the
                  room.
                </p>
              </div>
              <div className="fc-card p-5">
                <h3 className="font-bold text-on-surface">A name without a where</h3>
                <p className="mt-2 text-sm leading-relaxed text-on-surface-variant">
                  Later they&apos;re a row in your messages with no tether to the night, the venue, or the vibe.
                </p>
              </div>
              <div className="fc-card p-5">
                <h3 className="font-bold text-on-surface">Apps built to scroll</h3>
                <p className="mt-2 text-sm leading-relaxed text-on-surface-variant">
                  Every other product is optimized to keep you in the feed. Click is the handshake, the memory, and the
                  next event.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className={cn(PAGE_COLUMN_CLASS, "relative z-10 pb-16")}>
          <div className="grid gap-6 md:grid-cols-3">
            <div className="fc-card p-6">
              <Smartphone className="mb-4 h-6 w-6 text-primary" aria-hidden />
              <h2 className="text-lg font-bold text-on-surface">In person</h2>
              <p className="mt-2 text-sm leading-relaxed text-on-surface-variant">
                When you&apos;re standing together, phones confirm it. You swap profiles without
                hunting for a handle.
              </p>
            </div>
            <div className="fc-card p-6">
              <MapPin className="mb-4 h-6 w-6 text-primary" aria-hidden />
              <h2 className="text-lg font-bold text-on-surface">Events</h2>
              <p className="mt-2 text-sm leading-relaxed text-on-surface-variant">
                Nearby gatherings, RSVP with people you&apos;ve already met, and show up together.
              </p>
            </div>
            <div className="fc-card p-6">
              <CheckCircle className="mb-4 h-6 w-6 text-primary" aria-hidden />
              <h2 className="text-lg font-bold text-on-surface">Context</h2>
              <p className="mt-2 text-sm leading-relaxed text-on-surface-variant">
                Place, time, and how you met stay on the connection so follow-up is not a blank
                name.
              </p>
            </div>
          </div>
        </section>

        <section
          id="how-it-works"
          className={cn(PAGE_COLUMN_CLASS, "relative z-10 py-16")}
          aria-labelledby="how-it-works-heading"
        >
          <div>
            <div className="mb-10 text-center">
              <h2
                id="how-it-works-heading"
                data-testid="landing-playground-heading"
                className="text-3xl font-bold tracking-tight sm:text-4xl"
              >
                Try it.
              </h2>
              <p className="mx-auto mt-3 max-w-xl text-base text-on-surface-variant">
                A working tour of connections, map, chat, and QR. The handshake itself still happens
                on your phone.
              </p>
            </div>
            <LandingPlaygroundLazy />
          </div>
        </section>

        <section className={cn(PAGE_COLUMN_CLASS, "relative z-10 pb-8")}>
          <p className="mx-auto max-w-2xl text-center text-sm text-on-surface-variant">
            Running a venue, campus, or event program?{' '}
            <Link href="/enterprise" className="font-semibold text-primary hover:text-primary/80">
              See Click for Business
            </Link>
            .
          </p>
        </section>

        <section className={cn(PAGE_COLUMN_CLASS, "relative z-10 pb-8")} aria-labelledby="mission-heading">
          <div className="mx-auto max-w-2xl text-center">
            <h2 id="mission-heading" className="text-3xl font-bold tracking-tight sm:text-4xl">
              Built for the moment you put your phone down
            </h2>
            <p className="mt-4 text-base leading-relaxed text-on-surface-variant">
              Every other app is optimized to keep you scrolling. Click is optimized for the{' '}
              <span className="font-semibold text-primary">thirty seconds</span> when you meet someone worth knowing, and the months to come.
            </p>
          </div>
        </section>

        <section className={cn(PAGE_COLUMN_CLASS, "relative z-10 pb-24 pt-8")}>
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
