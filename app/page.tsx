'use client';

import { motion } from 'framer-motion';
import { Smartphone, Zap, Shield, Users, MapPin, CheckCircle, X, ArrowRight, Megaphone } from 'lucide-react';
import { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/AuthContext';
import LoadingScreen from '@/components/LoadingScreen';
import DashboardView from '@/components/DashboardView';
import LoginModal from '@/components/LoginModal';
import LiveConnectionTicker from '@/components/LiveConnectionTicker';
import BentoScreenshotShowcase from '@/components/landing/BentoScreenshotShowcase';
import NewFeaturesGrid from '@/components/landing/NewFeaturesGrid';
import PartnerDashboardShowcase from '@/components/landing/PartnerDashboardShowcase';
import LandingScreenshotFrame from '@/components/landing/LandingScreenshotFrame';
import LandingWebScreensCarousel from '@/components/landing/LandingWebScreensCarousel';
import { LANDING_IMG } from '@/lib/landingAssets';

export default function Home() {
  const { user, loading } = useAuth();
  const [showAuth, setShowAuth] = useState(false);
  const [signupFirst, setSignupFirst] = useState(false);
  const [showWaitlist, setShowWaitlist] = useState(false);
  const [waitlistEmail, setWaitlistEmail] = useState('');
  const [waitlistStatus, setWaitlistStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [waitlistMessage, setWaitlistMessage] = useState('');

  // Show loading screen while checking auth
  if (loading) {
    return <LoadingScreen />;
  }

  // Show dashboard directly if user is logged in (no redirect needed)
  if (user) {
    return <DashboardView user={user} />;
  }

  const openSignup = () => { setSignupFirst(true); setShowAuth(true); };
  const openLogin  = () => { setSignupFirst(false); setShowAuth(true); };

  const submitWaitlist = async () => {
    if (!waitlistEmail.includes('@')) {
      setWaitlistStatus('error');
      setWaitlistMessage('Enter a valid email address.');
      return;
    }

    setWaitlistStatus('loading');
    try {
      const response = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: waitlistEmail, source: 'homepage_hero' }),
      });
      const data = await response.json();
      if (data.success) {
        setWaitlistStatus('success');
        setWaitlistMessage(data.message || "You're on the list! We'll be in touch.");
        return;
      }
      setWaitlistStatus('error');
      setWaitlistMessage(data.error || 'Something went wrong.');
    } catch {
      setWaitlistStatus('error');
      setWaitlistMessage('Network error. Please try again.');
    }
  };

  return (
    <>
    <div className="min-h-screen bg-background text-on-surface overflow-x-hidden isolate">
      {/* Hero Section */}
      <section className="relative z-10 px-6 md:px-12 pt-20 md:pt-32 pb-20">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="text-center"
          >

            <h1 className="text-4xl sm:text-5xl md:text-7xl lg:text-8xl font-bold mb-6 tracking-tight">
              <span className="text-primary">Click</span>
              <span className="text-on-surface-variant">:</span> From{' '}
              <span className="text-on-surface">Handshake</span>
              <br />
              to{' '}
              <span className="text-primary">Friendship</span>
              <span className="text-primary">.</span>
            </h1>

            <p className="mx-auto mb-10 max-w-2xl px-4 text-base font-medium leading-relaxed text-on-surface-variant sm:text-lg md:text-xl">
              Stop scrolling. Start living. Press connect and we use secure Bluetooth plus inaudible sound to prove you share the same room. If you can see them, you can connect for real.
            </p>

            {/* CTA Buttons */}
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="mx-auto flex max-w-md flex-col items-center justify-center gap-3 px-4"
            >
              <motion.button
                whileTap={{ scale: 0.98 }}
                onClick={() => {
                  setShowWaitlist(true);
                  setWaitlistStatus('idle');
                  setWaitlistMessage('');
                }}
                className="fc-btn-primary w-full px-8 py-4 text-lg sm:w-auto"
              >
                Join the Waitlist
              </motion.button>

              <p className="text-sm font-medium text-on-surface-variant">Already have an account?</p>

              <div className="flex w-full flex-col items-center justify-center gap-3 sm:flex-row">
                <motion.button
                  whileTap={{ scale: 0.98 }}
                  onClick={openSignup}
                  className="fc-btn-secondary w-full whitespace-nowrap px-8 py-3.5 text-sm sm:w-auto sm:text-base"
                >
                  Create Account
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.98 }}
                  onClick={openLogin}
                  className="text-sm font-bold text-primary underline-offset-4 hover:underline sm:text-base"
                >
                  Sign In
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {showWaitlist && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onClick={() => setShowWaitlist(false)}
          role="presentation"
        >
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="fc-card w-full max-w-md border-2 border-border-hard p-6"
            style={{ backgroundColor: "var(--color-surface)" }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="waitlist-title"
          >
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <h2 id="waitlist-title" className="text-2xl font-bold text-on-surface">Join the Waitlist</h2>
                <p className="mt-2 text-sm text-on-surface-variant">
                  Leave your email and we&apos;ll reach out when we&apos;re ready.
                </p>
              </div>
              <button
                onClick={() => setShowWaitlist(false)}
                className="rounded-full border border-border-hard p-2 text-on-surface-variant transition hover:border-border-hard hover:text-on-surface"
                aria-label="Close waitlist modal"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {waitlistStatus === 'success' ? (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5 text-center"
              >
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 260, damping: 18 }}
                >
                  <CheckCircle className="mx-auto mb-3 h-10 w-10 text-emerald-700 dark:text-emerald-300" />
                </motion.div>
                <p className="font-medium text-emerald-700 dark:text-emerald-300">
                  You&apos;re on the list! We&apos;ll be in touch.
                </p>
                <p className="mt-2 text-sm text-on-surface-variant">{waitlistMessage}</p>
              </motion.div>
            ) : (
              <div className="space-y-4">
                <input
                  type="email"
                  value={waitlistEmail}
                  onChange={(event) => {
                    setWaitlistEmail(event.target.value);
                    if (waitlistStatus === 'error') {
                      setWaitlistStatus('idle');
                      setWaitlistMessage('');
                    }
                  }}
                  placeholder="you@example.com"
                  className="w-full rounded-2xl border border-border-hard bg-surface-container px-4 py-3 text-on-surface outline-none transition focus:border-primary"
                />
                {waitlistStatus === 'error' && (
                  <p className="text-sm text-red-700 dark:text-red-400">{waitlistMessage}</p>
                )}
                <button
                  onClick={submitWaitlist}
                  disabled={waitlistStatus === 'loading'}
                  className="fc-btn-primary w-full px-4 py-3 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {waitlistStatus === 'loading' ? 'Joining...' : 'Submit'}
                </button>
              </div>
            )}
          </motion.div>
        </div>
      )}

      {/* Why Click, live ticker, and problem/solution bento share one section so vertical rhythm stays even (no stacked section padding). */}
      <section className="relative z-10 px-6 md:px-12 pt-12 pb-20">
        <div className="mx-auto max-w-4xl text-center">
          <motion.div
            initial={{ y: 30, opacity: 0 }}
            whileInView={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
          >
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-4">
              Why <span className="text-primary">Click</span>?
            </h2>
            <p className="text-base sm:text-lg text-on-surface-variant leading-relaxed px-4">
              You&apos;ve had that conversation at a party, a class, a show, the kind where you think, <em>I should actually know this person.</em> Then you follow each other and it evaporates. Pretty soon they&apos;re just another handle in the same endless scroll as everyone else.
            </p>
          </motion.div>
        </div>

        <div className="mx-auto mt-12 w-full max-w-6xl">
          <LiveConnectionTicker />
        </div>

        <div className="mx-auto mt-12 w-full max-w-6xl">
          <motion.div
            initial={{ y: 30, opacity: 0 }}
            whileInView={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
            className="grid grid-cols-1 gap-6 md:grid-cols-2"
          >
            {/* Card 1 - The Problem */}
            <motion.div
              whileHover={{ y: -2 }}
              transition={{ type: "spring", stiffness: 300 }}
              className="fc-card p-8 rounded-[16px] border border-border-hard relative overflow-hidden group"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-red-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative z-10">
                <div className="w-12 h-12 rounded-2xl bg-red-500/10 flex items-center justify-center mb-6">
                  <span className="text-2xl">💀</span>
                </div>
                <h3 className="text-xl sm:text-2xl font-bold mb-4">The Follow-Back Void</h3>
                <p className="text-sm sm:text-base text-on-surface-variant leading-relaxed">
                  You follow them. They follow back. Neither of you ever sends a message. A month later you see them post something and you've already forgotten their name.
                </p>
              </div>
            </motion.div>

            {/* Card 2: friction of exchanging contact (solution: Proximity Tap) */}
            <motion.div
              whileHover={{ y: -2 }}
              transition={{ type: "spring", stiffness: 300 }}
              className="fc-card p-8 rounded-[16px] border border-border-hard relative overflow-hidden group"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative z-10">
                <div className="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center mb-6">
                  <Smartphone className="w-6 h-6 text-amber-700 dark:text-amber-300" />
                </div>
                <h3 className="text-xl sm:text-2xl font-bold mb-4">
                  The handle handoff
                </h3>
                <p className="text-sm sm:text-base text-on-surface-variant leading-relaxed">
                  You hunt for the right app, guess at spelling, and thumb-type while the conversation stalls. Half the time you save the wrong @ or the wrong name, and the person in front of you is already halfway across the room.
                </p>
              </div>
            </motion.div>

            {/* Card 3: contextless contacts (solution: memory capsule / tagging) */}
            <motion.div
              whileHover={{ y: -2 }}
              transition={{ type: "spring", stiffness: 300 }}
              className="fc-card p-8 rounded-[16px] border border-border-hard relative overflow-hidden group md:col-span-2"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative z-10">
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6">
                  <div className="flex-1">
                    <div className="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center mb-6">
                      <MapPin className="w-6 h-6 text-amber-700 dark:text-amber-300" />
                    </div>
                    <h3 className="text-xl sm:text-2xl font-bold mb-4">A name without a where</h3>
                    <p className="text-sm sm:text-base text-on-surface-variant leading-relaxed max-w-2xl">
                      Later, they&apos;re a row in your messages or a follow in a list, with no tether to the actual night, venue, or vibe. You remember liking them; you don&apos;t remember <em>where reality collided</em>, so reaching out feels oddly blank.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 md:max-w-[220px] md:justify-end md:pt-14">
                    <span className="rounded-full border border-border-hard/80 bg-surface-container/60 px-3 py-1 text-xs text-on-surface-variant">&quot;Which event was this?&quot;</span>
                    <span className="rounded-full border border-border-hard/80 bg-surface-container/60 px-3 py-1 text-xs text-on-surface-variant">&quot;Do I know you from…?&quot;</span>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Card 4: feed apps vs follow-up (solution: no-feed product shape) */}
            <motion.div
              whileHover={{ y: -2 }}
              transition={{ type: "spring", stiffness: 300 }}
              className="fc-card p-8 rounded-[16px] border border-border-hard relative overflow-hidden group md:col-span-2"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative z-10 text-center">
                <div className="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center mb-6 mx-auto">
                  <Zap className="w-6 h-6 text-amber-700 dark:text-amber-300" />
                </div>
                <h3 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-4">
                  Built to scroll, not to <span className="text-amber-700 dark:text-amber-300">follow up</span>
                </h3>
                <p className="text-sm sm:text-base md:text-lg text-on-surface-variant leading-relaxed max-w-2xl mx-auto">
                  The apps you open ten times a day are tuned for feeds, ads, and staying on platform, not for closing the loop with one human who&apos;s standing right there. So the follow happens; the actual relationship usually doesn&apos;t.
                </p>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Core Features Section */}
      <section className="relative z-10 px-6 md:px-12 py-20">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial={{ y: 30, opacity: 0 }}
            whileInView={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-6">
              How <span className="text-primary">Click</span> Works
            </h2>
            <p className="text-base sm:text-lg md:text-xl text-on-surface-variant max-w-3xl mx-auto leading-relaxed px-4">
              Here&apos;s what we built: simple enough for a five-second handshake, deliberate enough that the moment still means something later.
            </p>
          </motion.div>

          <div className="mb-12 max-w-6xl px-4 sm:mx-auto sm:px-0">
            <LandingScreenshotFrame
              id="landing-shot-memory-dashboard-inline"
              src={LANDING_IMG.memoryDashboard}
              alt="Click web — Personal dashboard with stats, availability, and milestones"
              sizes="(max-width: 768px) 100vw, (max-width: 1024px) 90vw, 1152px"
              loading="lazy"
              objectFit="contain"
            />
          </div>

          <div className="flex flex-col gap-8">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Proximity Tap: Tri-Factor Handshake */}
            <motion.div
              initial={{ y: 30, opacity: 0 }}
              whileInView={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.8, delay: 0.1 }}
              viewport={{ once: true }}
              className="fc-card p-8 rounded-[16px] border border-border-hard relative overflow-hidden group"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative z-10">
                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
                  <Smartphone className="w-8 h-8 text-primary" />
                </div>
                <h3 className="text-2xl font-bold mb-4">Proximity Tap</h3>
                <p className="text-sm font-medium text-inverse-primary mb-2">Tri-Factor Handshake</p>
                <p className="text-on-surface-variant leading-relaxed mb-4">
                  Press connect and let Click run a room-real handshake: secure Bluetooth plus inaudible sound prove you are standing together. Profiles swap when the moment is real, not when someone guessed a handle across the internet.
                </p>
                <ul className="space-y-2 text-on-surface-variant text-sm">
                  <li className="flex items-center gap-2">
                    <span className="text-primary">✓</span>
                    <span>No username archaeology in a loud room</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-primary">✓</span>
                    <span>Same-room verification, built for eye contact</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-primary">✓</span>
                    <span>One gesture, instant connection</span>
                  </li>
                </ul>
                <div className="mt-8 flex justify-center">
                  <LandingScreenshotFrame
                    id="landing-shot-add-click"
                    src={LANDING_IMG.addClick}
                    alt="Click mobile — Add Click with QR, scan, and tap to connect"
                    className="mx-auto w-full max-w-[280px]"
                    aspectClassName="aspect-[9/19]"
                    sizes="(max-width: 768px) min(100vw, 320px), 280px"
                  />
                </div>
              </div>
            </motion.div>

            {/* Availability Intents */}
            <motion.div
              initial={{ y: 30, opacity: 0 }}
              whileInView={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.8, delay: 0.12 }}
              viewport={{ once: true }}
              className="fc-card p-8 rounded-[16px] border border-border-hard relative overflow-hidden group"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative z-10">
                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
                  <Megaphone className="w-8 h-8 text-primary" />
                </div>
                <h3 className="text-2xl font-bold mb-4">Availability Intents</h3>
                <p className="text-sm font-medium text-inverse-primary mb-2">The vibe broadcast</p>
                <p className="text-on-surface-variant leading-relaxed mb-4">
                  Stop guessing who is free. For up to twenty-four hours, broadcast what you are up for, like &quot;Looking for coffee,&quot; &quot;Down to study,&quot; or &quot;Live music.&quot; When your connections&apos; intents overlap, we nudge you both. Less planning theater, more showing up.
                </p>
                <ul className="space-y-2 text-on-surface-variant text-sm">
                  <li className="flex items-center gap-2">
                    <span className="text-primary">✓</span>
                    <span>Signals expire so your status never goes stale</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-primary">✓</span>
                    <span>Friend-led, not another public feed</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-primary">✓</span>
                    <span>Overlap alerts only when it actually matches</span>
                  </li>
                </ul>
                <div className="mt-8 flex justify-center">
                  <LandingScreenshotFrame
                    id="landing-shot-share-availability"
                    src={LANDING_IMG.shareAvailability}
                    alt="Click mobile — Share availability with timeframe and intent tag"
                    className="mx-auto w-full max-w-[280px]"
                    aspectClassName="aspect-[9/19]"
                    sizes="(max-width: 768px) min(100vw, 320px), 280px"
                  />
                </div>
              </div>
            </motion.div>
            </div>

            {/* Multi-Tap + Click Map: one row, vertical carousel for web screenshots */}
            <motion.div
              initial={{ y: 30, opacity: 0 }}
              whileInView={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.8, delay: 0.15 }}
              viewport={{ once: true }}
              className="fc-card p-8 rounded-[16px] border border-border-hard relative overflow-hidden group"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative z-10">
                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
                  <Users className="w-8 h-8 text-primary" />
                </div>
                <h3 className="text-2xl font-bold mb-4">Multi-Tap Groups</h3>
                <p className="text-sm font-medium text-inverse-primary mb-2">Organic Cliques</p>
                <p className="text-on-surface-variant leading-relaxed mb-6 max-w-3xl">
                  Met a whole group at once? Everyone hits connect at the same beat. Click checks the graph in the background so every person in that window really opted in together, then drops you into a verified group chat. Boom. Instant clique.
                </p>
                <ul className="mb-10 grid gap-2 text-on-surface-variant text-sm sm:grid-cols-2 lg:grid-cols-3">
                  <li className="flex items-center gap-2">
                    <span className="text-primary">✓</span>
                    <span>N-way validation in plain English: everyone matched the same moment</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-primary">✓</span>
                    <span>No threading DMs to seven people you just met</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-primary">✓</span>
                    <span>Math-backed trust, magic-backed vibes</span>
                  </li>
                </ul>

                <div className="border-t border-border-hard pt-10 mt-2">
                  <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
                    <MapPin className="w-8 h-8 text-primary" />
                  </div>
                  <h3 className="text-2xl font-bold mb-4">Click Map</h3>
                  <p className="text-sm font-medium text-inverse-primary mb-2">Where your memories were made</p>
                  <p className="text-on-surface-variant leading-relaxed mb-2 max-w-3xl">
                    See where you met everyone, then turn on layers for your network, official soundtracks, community beacons, and hazards, all on one map built for the web dashboard.
                  </p>
                </div>

                <LandingWebScreensCarousel />
              </div>
            </motion.div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <motion.div
              initial={{ y: 30, opacity: 0 }}
              whileInView={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.8, delay: 0.25 }}
              viewport={{ once: true }}
              className="fc-card p-8 rounded-[16px] border border-border-hard relative overflow-hidden group"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative z-10">
                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
                  <span className="text-3xl">📍</span>
                </div>
                <h3 className="text-2xl font-bold mb-4">You&apos;ll Remember How You Met</h3>
                <p className="text-on-surface-variant leading-relaxed mb-4">
                  After you connect, a quick sheet asks you to label the encounter (presets or a short custom line). With your permission, we attach place, time, weather, and an optional ambient snapshot. That becomes a memory capsule on the connection, so months later you know it was the comedy show at the quiet coffee shop on Pike in the drizzle, not just &quot;some person from that event.&quot;
                </p>
                <div className="space-y-3">
                  <div className="fc-card p-3 rounded-xl text-xs">
                    <p className="text-on-surface-variant">Met <span className="text-primary font-semibold">Historia</span> at Red Square</p>
                    <p className="text-on-surface-variant mt-1">Weather: Sunny & Warm</p>
                    <p className="text-on-surface-variant mt-1">Volume: Loud</p>
                    <p className="text-on-surface-variant mt-1">Event: Outdoor concert</p>
                    <p className="text-on-surface-variant mt-1">Time: Yesterday afternoon</p>
                  </div>
                  <div className="fc-card p-3 rounded-xl text-xs">
                    <p className="text-on-surface-variant">Clicked with <span className="text-primary font-semibold">Ymir</span> at Pike Place</p>
                    <p className="text-on-surface-variant mt-1">Weather: Drizzly & Cold</p>
                    <p className="text-on-surface-variant mt-1">Volume: Moderate</p>
                    <p className="text-on-surface-variant mt-1">Event: Indoor comedy show</p>
                    <p className="text-on-surface-variant mt-1">Time: Last week</p>
                  </div>
                </div>
                <div className="mt-8 flex justify-center">
                  <LandingScreenshotFrame
                    id="landing-shot-profile-rich"
                    src={LANDING_IMG.profileMobile}
                    alt="Click mobile — Profile with moment, place, time, weather, and interests"
                    className="mx-auto w-full max-w-[260px]"
                    aspectClassName="aspect-[754/1024]"
                    sizes="(max-width: 768px) min(100vw, 320px), 260px"
                  />
                </div>
              </div>
            </motion.div>

            {/* Event / partner analytics teaser */}
            <motion.div
              initial={{ y: 30, opacity: 0 }}
              whileInView={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.8, delay: 0.3 }}
              viewport={{ once: true }}
              className="fc-card p-8 rounded-[16px] border border-border-hard relative overflow-visible group lg:col-span-2"
            >
              <div className="absolute inset-0 rounded-[16px] bg-gradient-to-br from-primary/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
              <div className="relative z-10">
                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
                  <span className="text-3xl">📊</span>
                </div>
                <h3 className="text-2xl font-bold mb-4">Event and campus partners</h3>
                <p className="text-on-surface-variant leading-relaxed mb-4 max-w-2xl lg:max-w-none">
                  Organizers still get the anonymized pulse of where real introductions cluster, including when verified friend groups show up together. Curious about Vibe Radar or sponsorship-grade insights? See the{' '}
                  <Link href="/enterprise" className="text-primary underline-offset-4 hover:underline">
                    enterprise overview
                  </Link>
                  .
                </p>
                <ul className="space-y-2 text-on-surface-variant text-sm max-w-2xl">
                  <li className="flex items-center gap-2">
                    <span className="text-primary">•</span>
                    <span>Connection density and verified micro-community signals where enabled</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-primary">•</span>
                    <span>Event analytics tuned for repeat-worthy programming</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-primary">•</span>
                    <span>Aggregate, consent-forward reporting</span>
                  </li>
                </ul>
                <PartnerDashboardShowcase />
              </div>
            </motion.div>
          </div>
          </div>
        </div>
      </section>

      <BentoScreenshotShowcase />

      <NewFeaturesGrid />

      {/* The Big Dream Section */}
      <section id="mission" className="relative z-10 px-6 md:px-12 py-32">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial={{ y: 30, opacity: 0 }}
            whileInView={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
            className="fc-card p-12 md:p-16 rounded-[16px] border border-border-hard relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent" />
            <div className="relative z-10">
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-6 text-center">
                Built for the moment{' '}
                <span className="bg-gradient-to-r from-primary to-purple-400 bg-clip-text text-transparent">
                  you put your phone down.
                </span>
              </h2>
              <p className="text-base sm:text-lg md:text-xl text-on-surface-variant text-center max-w-3xl mx-auto mb-12 leading-relaxed px-4">
                Every other app is optimized to keep you scrolling. <span className="text-primary font-semibold">Click</span> is optimized for the thirty seconds when you meet someone worth knowing.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-12">
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  className="text-center"
                >
                  <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4 mx-auto">
                    <Shield className="w-8 h-8 text-primary" />
                  </div>
                  <h4 className="text-lg font-semibold mb-2">No Tracking</h4>
                  <p className="text-on-surface-variant text-sm">
                    Your data is yours. No ads, no data brokers, no exceptions.
                  </p>
                </motion.div>

                <motion.div
                  whileHover={{ scale: 1.05 }}
                  className="text-center"
                >
                  <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4 mx-auto">
                    <Zap className="w-8 h-8 text-primary" />
                  </div>
                  <h4 className="text-lg font-semibold mb-2">Student Built</h4>
                  <p className="text-on-surface-variant text-sm">
                    Built by students who were tired of losing people they actually liked. Launching 2026.
                  </p>
                </motion.div>

                <motion.div
                  whileHover={{ scale: 1.05 }}
                  className="text-center"
                >
                  <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4 mx-auto">
                    <Users className="w-8 h-8 text-primary" />
                  </div>
                  <h4 className="text-lg font-semibold mb-2">Offline First</h4>
                  <p className="text-on-surface-variant text-sm">
                    Designed to get you off your phone, not keep you on it. Use Click for what you actually want to do.
                  </p>
                </motion.div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Join us: final conversion — surface card (not on-primary-container, which is a text token) */}
      <section className="relative z-10 px-6 md:px-12 pb-24 pt-8">
        <div className="mx-auto max-w-3xl text-center">
          <motion.div
            initial={{ y: 28, opacity: 0 }}
            whileInView={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.75 }}
            viewport={{ once: true, margin: '-60px' }}
            className="rounded-[16px] border-2 border-border-hard bg-surface px-8 py-12 sm:px-12 sm:py-14"
          >
            <h2 className="text-3xl font-bold tracking-tight text-on-surface sm:text-4xl md:text-5xl">
              Join us <span className="text-primary">today</span>
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-on-surface-variant sm:text-lg">
              We&apos;re building Click in the open. Get on the waitlist for early access, or create an account now and
              start using the web dashboard. Your profile, intents, and verified connections stay in sync when the mobile app ships.
            </p>
            <ul className="mx-auto mt-8 flex max-w-md flex-col gap-3 text-left text-sm text-on-surface-variant sm:mx-auto sm:max-w-lg">
              <li className="flex items-start gap-3">
                <span className="mt-0.5 font-bold text-primary" aria-hidden>
                  ✓
                </span>
                <span>
                  <span className="font-semibold text-on-surface">Be first in line </span> when we open invites and campus
                  pilots. You&apos;ll hear directly from us.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="mt-0.5 font-bold text-primary" aria-hidden>
                  ✓
                </span>
                <span>
                  <span className="font-semibold text-on-surface">Lock in your identity</span> on Click now so nobody else
                  has to guess your name in a noisy room later.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="mt-0.5 font-bold text-primary" aria-hidden>
                  ✓
                </span>
                <span>
                  <span className="font-semibold text-on-surface">Always free to join</span>. No credit card, no ads, no feed to
                  scroll before you get started.
                </span>
              </li>
            </ul>

            <div className="mt-10 flex flex-col items-stretch gap-3 sm:items-center">
              <motion.button
                type="button"
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => {
                  setShowWaitlist(true);
                  setWaitlistStatus('idle');
                  setWaitlistMessage('');
                }}
                className="fc-btn-primary inline-flex w-full items-center justify-center gap-2 px-8 py-4 text-base sm:w-auto"
              >
                Join the waitlist
                <ArrowRight className="h-4 w-4 opacity-90" aria-hidden />
              </motion.button>
              <p className="text-xs font-medium text-on-surface-variant">Already have an account?</p>
              <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:justify-center">
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={openSignup}
                  className="fc-btn-primary px-8 py-3.5 text-sm sm:text-base"
                >
                  Create account
                </motion.button>
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={openLogin}
                  className="fc-btn-secondary px-8 py-3.5 text-sm sm:text-base"
                >
                  Sign in
                </motion.button>
              </div>
            </div>
          </motion.div>
        </div>
      </section>
    </div>

      {/* Auth modal - opens in sign-up or sign-in mode depending on which button was clicked */}
      <LoginModal
        isOpen={showAuth}
        onClose={() => setShowAuth(false)}
        initialIsSignup={signupFirst}
      />
    </>
  );
}

