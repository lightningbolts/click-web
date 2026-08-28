'use client';

import { motion } from 'framer-motion';
import { CheckCircle, MapPin, Smartphone } from 'lucide-react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/AuthContext';
import HomeAuthenticated from '@/components/HomeAuthenticated';
import ClickLogo from '@/components/ClickLogo';
import LandingPlayground from '@/components/landing/playground';
import WaitlistModal from '@/components/marketing/WaitlistModal';

/**
 * Marketing homepage. Never gates on auth `loading` so SSR/crawlers receive
 * indexable hero copy. After client login, swaps to the dashboard.
 */
export default function LandingPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [showWaitlist, setShowWaitlist] = useState(false);

  useEffect(() => {
    if (user) {
      router.refresh();
    }
  }, [user, router]);

  if (user) {
    return <HomeAuthenticated user={user} />;
  }

  const openWaitlist = () => {
    setShowWaitlist(true);
  };

  return (
    <>
      <div className="min-h-screen bg-background text-on-surface overflow-x-hidden isolate">
        <section className="relative z-10 flex min-h-[calc(100svh-var(--navbar-height))] flex-col items-center justify-center px-6 py-16 md:px-12">
          <motion.div
            initial={false}
            animate={{ y: 0, opacity: 1 }}
            className="flex flex-col items-center text-center"
          >
            <ClickLogo
              variant="mark"
              size={180}
              className="h-36 w-36 sm:h-44 sm:w-44 md:h-[180px] md:w-[180px]"
              priority
            />
            <h1 className="mt-8 text-4xl font-bold tracking-tight sm:text-5xl">
              <span className="text-primary">C</span>
              <span className="text-on-surface">lick:</span>
              <span className="text-primary"> from handshake to friendship.</span>
            </h1>
            <p className="mt-4 max-w-md text-base font-medium leading-relaxed text-on-surface-variant sm:text-lg">
              Stop scrolling. Start living.
            </p>
            <button
              type="button"
              onClick={openWaitlist}
              data-testid="waitlist-cta"
              className="fc-btn-primary mt-8 px-8 py-4 text-lg"
            >
              Join the Waitlist
            </button>
            <Link
              href="/about"
              className="mt-4 text-sm font-semibold text-on-surface-variant hover:text-primary"
            >
              About
            </Link>
          </motion.div>
        </section>

        <WaitlistModal
          open={showWaitlist}
          onClose={() => setShowWaitlist(false)}
          source="homepage_hero"
        />

        <section id="why" className="relative z-10 px-6 pb-8 pt-16 md:px-12" aria-labelledby="why-heading">
          <div className="mx-auto max-w-5xl">
            <h2 id="why-heading" className="text-center text-3xl font-bold tracking-tight sm:text-4xl">
              Why Click exists
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-center text-base leading-relaxed text-on-surface-variant">
              You&apos;ve had that conversation at a party, a class, a show — the kind where you think,{' '}
              <span className="font-semibold text-primary">I should actually know this person</span>. Then you follow
              each other and it evaporates. Pretty soon they&apos;re just another handle in the same endless scroll.
            </p>
            <div className="mt-8 grid gap-4 md:grid-cols-2">
              <div className="rounded-[16px] border border-border-hard border-l-4 border-l-primary bg-surface p-5">
                <h3 className="font-bold text-on-surface">The follow-back void</h3>
                <p className="mt-2 text-sm leading-relaxed text-on-surface-variant">
                  You follow. They follow back. Neither of you ever sends a message.
                </p>
              </div>
              <div className="rounded-[16px] border border-border-hard border-l-4 border-l-primary bg-surface p-5">
                <h3 className="font-bold text-on-surface">The handle handoff</h3>
                <p className="mt-2 text-sm leading-relaxed text-on-surface-variant">
                  You hunt for the right app, guess at spelling, and the person in front of you is already across the
                  room.
                </p>
              </div>
              <div className="rounded-[16px] border border-border-hard border-l-4 border-l-primary bg-surface p-5">
                <h3 className="font-bold text-on-surface">A name without a where</h3>
                <p className="mt-2 text-sm leading-relaxed text-on-surface-variant">
                  Later they&apos;re a row in your messages with no tether to the night, the venue, or the vibe.
                </p>
              </div>
              <div className="rounded-[16px] border border-border-hard border-l-4 border-l-primary bg-surface p-5">
                <h3 className="font-bold text-on-surface">Apps built to scroll</h3>
                <p className="mt-2 text-sm leading-relaxed text-on-surface-variant">
                  Every other product is optimized to keep you in the feed. Click is the handshake, the memory, and the
                  next event.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="relative z-10 px-6 pb-16 md:px-12">
          <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-3">
            <div className="fc-card p-6">
              <Smartphone className="mb-4 h-6 w-6 text-primary" aria-hidden />
              <h2 className="text-lg font-bold text-on-surface">In person</h2>
              <p className="mt-2 text-sm leading-relaxed text-on-surface-variant">
                Proximity Tap (Bluetooth + inaudible audio) proves you are standing together.
                Profiles swap without hunting a handle.
              </p>
            </div>
            <div className="fc-card border-l-4 border-l-primary p-6">
              <MapPin className="mb-4 h-6 w-6 text-on-surface-variant" aria-hidden />
              <h2 className="text-lg font-bold text-on-surface">Events</h2>
              <p className="mt-2 text-sm leading-relaxed text-on-surface-variant">
                Nearby gatherings, RSVP with people you already Clicked, join the route when it
                is time to show up.
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
          className="relative z-10 px-6 py-16 md:px-12"
          aria-labelledby="how-it-works-heading"
        >
          <div className="mx-auto max-w-6xl">
            <div className="mb-10 text-center">
              <h2
                id="how-it-works-heading"
                data-testid="landing-playground-heading"
                className="text-3xl font-bold tracking-tight sm:text-4xl"
              >
                Try it.
              </h2>
              <p className="mx-auto mt-3 max-w-xl text-base text-on-surface-variant">
                Tap someone in the room, RSVP to a night out, then use the same Memory Box, map,
                chat, and QR identity as the logged-in site.
              </p>
            </div>
            <LandingPlayground />
          </div>
        </section>

        <section className="relative z-10 px-6 pb-8 md:px-12">
          <p className="mx-auto max-w-2xl text-center text-sm text-on-surface-variant">
            Running a venue, campus, or event program?{' '}
            <Link href="/enterprise" className="font-semibold text-primary hover:text-primary/80">
              See Click for enterprise
            </Link>
            .
          </p>
        </section>

        <section className="relative z-10 px-6 pb-8 md:px-12" aria-labelledby="mission-heading">
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

        <section className="relative z-10 px-6 pb-24 pt-8 md:px-12">
          <div className="mx-auto max-w-xl rounded-[16px] border border-border-hard border-t-4 border-t-primary bg-surface px-8 py-12 text-center">
            <h2 className="text-3xl font-bold tracking-tight text-on-surface sm:text-4xl">
              Launching in Fall 2026.
            </h2>
            <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-on-surface-variant sm:text-base">
              No ads. No feed. Built at UW.
            </p>
            <button
              type="button"
              onClick={openWaitlist}
              className="fc-btn-primary mt-8 px-8 py-4 text-base"
            >
              Join the Waitlist
            </button>
          </div>
        </section>
      </div>
    </>
  );
}
