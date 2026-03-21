'use client';

import { motion } from 'framer-motion';
import { Smartphone, Zap, Shield, Users, Clock, Sparkles, CheckCircle, X } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import LoadingScreen from '@/components/LoadingScreen';
import DashboardView from '@/components/DashboardView';
import LoginModal from '@/components/LoginModal';

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
    <div className="min-h-screen bg-zinc-950 text-white overflow-hidden">
      {/* Background gradient effects */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-[#8338EC] rounded-full blur-[120px] opacity-20" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-[#8338EC] rounded-full blur-[120px] opacity-20" />
      </div>

      {/* Hero Section */}
      <section className="relative z-10 px-6 md:px-12 pt-20 md:pt-32 pb-20">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="text-center"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.8, delay: 0.3 }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass mb-8"
            >
              <Sparkles className="w-4 h-4 text-[#8338EC]" />
              <span className="text-sm text-zinc-300">In the works</span>
            </motion.div>

            <h1 className="text-4xl sm:text-5xl md:text-7xl lg:text-8xl font-bold mb-6 tracking-tight">
              <span className="text-[#8338EC]">Click</span>
              <span className="text-zinc-500">:</span> From{' '}
              <span className="bg-gradient-to-r from-white via-zinc-200 to-zinc-400 bg-clip-text text-transparent">
                Handshake
              </span>
              <br />
              to{' '}
              <span className="text-[#8338EC]">Friendship</span>
              <span className="text-[#8338EC] animate-pulse">.</span>
            </h1>

            <p className="text-base sm:text-lg md:text-xl text-zinc-400 max-w-3xl mx-auto mb-3 leading-relaxed px-4">
              You know that feeling — great conversation with someone you just met, followed each other on Instagram, never talked again. <span className="text-[#8338EC] font-semibold">Click</span> is built for that moment.
            </p>
            <p className="text-sm sm:text-base md:text-lg text-zinc-500 max-w-3xl mx-auto mb-12 leading-relaxed px-4">
              Tap phones. No usernames, no handles, no algorithm. Just the person standing in front of you.
            </p>

            {/* CTA Buttons */}
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.8, delay: 0.6 }}
              className="flex flex-col gap-3 justify-center items-center max-w-md mx-auto px-4"
            >
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => {
                  setShowWaitlist(true);
                  setWaitlistStatus('idle');
                  setWaitlistMessage('');
                }}
                className="w-full sm:w-auto px-8 py-4 rounded-2xl bg-[#8338EC] hover:bg-[#9d4eff] text-white font-semibold text-lg transition-all duration-200 shadow-lg shadow-[#8338EC]/30 hover:shadow-[#8338EC]/50"
              >
                Join the Waitlist
              </motion.button>

              <p className="text-zinc-500 text-sm">Already have an account?</p>

              <div className="flex flex-col sm:flex-row gap-3 justify-center items-center w-full">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={openSignup}
                  className="w-full sm:w-auto px-8 py-3.5 bg-[#8338EC] hover:bg-[#9d4eff] rounded-full font-semibold transition-all glow-violet text-sm sm:text-base whitespace-nowrap"
                >
                  Create Account
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={openLogin}
                  className="w-full sm:w-auto px-8 py-3.5 glass rounded-full font-semibold border border-zinc-700 hover:border-[#8338EC]/50 transition-all text-sm sm:text-base whitespace-nowrap"
                >
                  Sign In
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {showWaitlist && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="w-full max-w-md rounded-3xl border border-zinc-800 bg-zinc-950/95 p-6 shadow-2xl backdrop-blur-xl"
          >
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold text-white">Join the Waitlist</h2>
                <p className="mt-2 text-sm text-zinc-400">
                  Leave your email and we&apos;ll reach out when we&apos;re ready.
                </p>
              </div>
              <button
                onClick={() => setShowWaitlist(false)}
                className="rounded-full border border-zinc-800 p-2 text-zinc-400 transition hover:border-zinc-700 hover:text-white"
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
                  <CheckCircle className="mx-auto mb-3 h-10 w-10 text-emerald-400" />
                </motion.div>
                <p className="font-medium text-emerald-300">
                  You&apos;re on the list! We&apos;ll be in touch.
                </p>
                <p className="mt-2 text-sm text-zinc-400">{waitlistMessage}</p>
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
                  className="w-full rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-white outline-none transition focus:border-[#8338EC]"
                />
                {waitlistStatus === 'error' && (
                  <p className="text-sm text-red-400">{waitlistMessage}</p>
                )}
                <button
                  onClick={submitWaitlist}
                  disabled={waitlistStatus === 'loading'}
                  className="w-full rounded-2xl bg-[#8338EC] px-4 py-3 font-semibold text-white transition hover:bg-[#9d4eff] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {waitlistStatus === 'loading' ? 'Joining...' : 'Submit'}
                </button>
              </div>
            )}
          </motion.div>
        </div>
      )}

      {/* Why Click Section */}
      <section className="relative z-10 px-6 md:px-12 py-12">
        <div className="max-w-4xl mx-auto text-center">
          <motion.div
            initial={{ y: 30, opacity: 0 }}
            whileInView={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
          >
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-4">
              Why <span className="text-[#8338EC]">Click</span>?
            </h2>
            <p className="text-base sm:text-lg text-zinc-400 leading-relaxed px-4">
              You've had that conversation at a party, a class, a show — the kind where you think, <em>I should actually know this person.</em> Then you follow each other and it evaporates. <span className="text-[#8338EC] font-semibold">Click</span> keeps that from happening.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Problem vs Solution - Bento Grid */}
      <section className="relative z-10 px-6 md:px-12 py-20">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial={{ y: 30, opacity: 0 }}
            whileInView={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
            className="grid grid-cols-1 md:grid-cols-2 gap-6"
          >
            {/* Card 1 - The Problem */}
            <motion.div
              whileHover={{ y: -8, scale: 1.02 }}
              transition={{ type: "spring", stiffness: 300 }}
              className="glass p-8 rounded-3xl border border-zinc-800 relative overflow-hidden group"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-red-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative z-10">
                <div className="w-12 h-12 rounded-2xl bg-red-500/10 flex items-center justify-center mb-6">
                  <span className="text-2xl">💀</span>
                </div>
                <h3 className="text-xl sm:text-2xl font-bold mb-4">The Follow-Back Void</h3>
                <p className="text-sm sm:text-base text-zinc-400 leading-relaxed">
                  You follow them. They follow back. Neither of you ever sends a message. A month later you see them post something and you've already forgotten their name.
                </p>
              </div>
            </motion.div>

            {/* Card 2 - NFC Tap */}
            <motion.div
              whileHover={{ y: -8, scale: 1.02 }}
              transition={{ type: "spring", stiffness: 300 }}
              className="glass p-8 rounded-3xl border border-zinc-800 relative overflow-hidden group"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-[#8338EC]/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative z-10">
                <div className="w-12 h-12 rounded-2xl bg-[#8338EC]/10 flex items-center justify-center mb-6">
                  <Smartphone className="w-6 h-6 text-[#8338EC]" />
                </div>
                <h3 className="text-xl sm:text-2xl font-bold mb-4">
                  Tap. Done.
                </h3>
                <p className="text-sm sm:text-base text-zinc-400 leading-relaxed">
                  NFC tap or QR scan to swap profiles in under a second. No asking for their handle. No "it's spelled with an underscore."
                </p>
              </div>
            </motion.div>

            {/* Card 3 - 30-Minute Vibe Check */}
            <motion.div
              whileHover={{ y: -8, scale: 1.02 }}
              transition={{ type: "spring", stiffness: 300 }}
              className="glass p-8 rounded-3xl border border-zinc-800 relative overflow-hidden group md:col-span-2"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-[#8338EC]/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative z-10">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
                  <div className="flex-1">
                    <div className="w-12 h-12 rounded-2xl bg-[#8338EC]/10 flex items-center justify-center mb-6">
                      <Clock className="w-6 h-6 text-[#8338EC]" />
                    </div>
                    <h3 className="text-xl sm:text-2xl font-bold mb-4">30-Minute Vibe Check</h3>
                    <p className="text-sm sm:text-base text-zinc-400 leading-relaxed max-w-2xl">
                      After you tap, you can open a timed chat. It disappears when the clock runs out — unless you both choose to save it. Good when the conversation's there. No weirdness when it's not.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <motion.div
                      animate={{ scale: [1, 1.2, 1] }}
                      transition={{ duration: 2, repeat: Infinity }}
                      className="w-3 h-3 rounded-full bg-[#8338EC]"
                    />
                    <span className="text-[#8338EC] font-mono text-sm">30:00</span>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Card 4 - No Feed */}
            <motion.div
              whileHover={{ y: -8, scale: 1.02 }}
              transition={{ type: "spring", stiffness: 300 }}
              className="glass p-8 rounded-3xl border border-zinc-800 relative overflow-hidden group md:col-span-2"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-[#8338EC]/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative z-10 text-center">
                <div className="w-12 h-12 rounded-2xl bg-[#8338EC]/10 flex items-center justify-center mb-6 mx-auto">
                  <Zap className="w-6 h-6 text-[#8338EC]" />
                </div>
                <h3 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-4">
                  No Feed. <span className="text-[#8338EC]">Ever.</span>
                </h3>
                <p className="text-sm sm:text-base md:text-lg text-zinc-400 leading-relaxed max-w-2xl mx-auto">
                  A tool, not a trap. No doomscrolling, no ads, no algorithm deciding who you should care about. Open the app, see your people, close it.
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
              How <span className="text-[#8338EC]">Click</span> Works
            </h2>
            <p className="text-base sm:text-lg md:text-xl text-zinc-400 max-w-3xl mx-auto leading-relaxed px-4">
              Simple enough to use in a five-second handshake.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* NFC/QR Exchange */}
            <motion.div
              initial={{ y: 30, opacity: 0 }}
              whileInView={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.8, delay: 0.1 }}
              viewport={{ once: true }}
              className="glass p-8 rounded-3xl border border-zinc-800 relative overflow-hidden group"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-[#8338EC]/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative z-10">
                <div className="w-16 h-16 rounded-2xl bg-[#8338EC]/10 flex items-center justify-center mb-6">
                  <Smartphone className="w-8 h-8 text-[#8338EC]" />
                </div>
                <h3 className="text-2xl font-bold mb-4">Tap or Scan</h3>
                <p className="text-zinc-400 leading-relaxed mb-4">
                  Tap phones with NFC or pull up a QR code. Profiles swap instantly — no typing, no spelling things out.
                </p>
                <ul className="space-y-2 text-zinc-500 text-sm">
                  <li className="flex items-center gap-2">
                    <span className="text-[#8338EC]">✓</span>
                    <span>No searching for usernames</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-[#8338EC]">✓</span>
                    <span>Works offline, syncs later</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-[#8338EC]">✓</span>
                    <span>One tap, instant connection</span>
                  </li>
                </ul>
              </div>
            </motion.div>

            {/* Contextual Tagging */}
            <motion.div
              initial={{ y: 30, opacity: 0 }}
              whileInView={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              viewport={{ once: true }}
              className="glass p-8 rounded-3xl border border-zinc-800 relative overflow-hidden group"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-[#8338EC]/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative z-10">
                <div className="w-16 h-16 rounded-2xl bg-[#8338EC]/10 flex items-center justify-center mb-6">
                  <span className="text-3xl">📍</span>
                </div>
                <h3 className="text-2xl font-bold mb-4">You'll Remember Where You Met</h3>
                <p className="text-zinc-400 leading-relaxed mb-4">
                  Every connection logs the time and place. Months later you'll know it was the coffee shop on Pike, not just "some person from that event."
                </p>
                <div className="space-y-3">
                  <div className="glass p-3 rounded-xl text-xs">
                    <p className="text-zinc-300">Met <span className="text-[#8338EC] font-semibold">Historia</span> at Red Square</p>
                    <p className="text-zinc-500 mt-1">Yesterday afternoon</p>
                  </div>
                  <div className="glass p-3 rounded-xl text-xs">
                    <p className="text-zinc-300">Clicked with <span className="text-[#8338EC] font-semibold">Ymir</span> at Pike Place</p>
                    <p className="text-zinc-500 mt-1">Last week</p>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Business Insights */}
            <motion.div
              initial={{ y: 30, opacity: 0 }}
              whileInView={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.8, delay: 0.3 }}
              viewport={{ once: true }}
              className="glass p-8 rounded-3xl border border-zinc-800 relative overflow-hidden group"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-[#8338EC]/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative z-10">
                <div className="w-16 h-16 rounded-2xl bg-[#8338EC]/10 flex items-center justify-center mb-6">
                  <span className="text-3xl">📊</span>
                </div>
                <h3 className="text-2xl font-bold mb-4">Event Analytics</h3>
                <p className="text-zinc-400 leading-relaxed mb-4">
                  For organizers and companies: see where people are actually meeting and which events are worth throwing again.
                </p>
                <ul className="space-y-2 text-zinc-500 text-sm">
                  <li className="flex items-center gap-2">
                    <span className="text-[#8338EC]">•</span>
                    <span>Connection density heatmaps</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-[#8338EC]">•</span>
                    <span>Event analytics & engagement metrics</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-[#8338EC]">•</span>
                    <span>All data anonymized & aggregated</span>
                  </li>
                </ul>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* The Big Dream Section */}
      <section id="mission" className="relative z-10 px-6 md:px-12 py-32">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial={{ y: 30, opacity: 0 }}
            whileInView={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
            className="glass p-12 md:p-16 rounded-3xl border border-zinc-800 relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-[#8338EC]/5 to-transparent" />
            <div className="relative z-10">
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-6 text-center">
                Built for the moment{' '}
                <span className="bg-gradient-to-r from-[#8338EC] to-purple-400 bg-clip-text text-transparent">
                  you put your phone down
                </span>
              </h2>
              <p className="text-base sm:text-lg md:text-xl text-zinc-400 text-center max-w-3xl mx-auto mb-12 leading-relaxed px-4">
                Every other app is optimized to keep you scrolling. <span className="text-[#8338EC] font-semibold">Click</span> is optimized for the thirty seconds when you meet someone worth knowing.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-12">
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  className="text-center"
                >
                  <div className="w-16 h-16 rounded-2xl bg-[#8338EC]/10 flex items-center justify-center mb-4 mx-auto">
                    <Shield className="w-8 h-8 text-[#8338EC]" />
                  </div>
                  <h4 className="text-lg font-semibold mb-2">No Tracking</h4>
                  <p className="text-zinc-500 text-sm">
                    Your data is yours. No ads, no data brokers, no exceptions.
                  </p>
                </motion.div>

                <motion.div
                  whileHover={{ scale: 1.05 }}
                  className="text-center"
                >
                  <div className="w-16 h-16 rounded-2xl bg-[#8338EC]/10 flex items-center justify-center mb-4 mx-auto">
                    <Zap className="w-8 h-8 text-[#8338EC]" />
                  </div>
                  <h4 className="text-lg font-semibold mb-2">Student Built</h4>
                  <p className="text-zinc-500 text-sm">
                    Built by students who were tired of losing people they actually liked. Launching 2026.
                  </p>
                </motion.div>

                <motion.div
                  whileHover={{ scale: 1.05 }}
                  className="text-center"
                >
                  <div className="w-16 h-16 rounded-2xl bg-[#8338EC]/10 flex items-center justify-center mb-4 mx-auto">
                    <Users className="w-8 h-8 text-[#8338EC]" />
                  </div>
                  <h4 className="text-lg font-semibold mb-2">Offline First</h4>
                  <p className="text-zinc-500 text-sm">
                    Designed to get you off your phone, not keep you on it. Works without signal and syncs later.
                  </p>
                </motion.div>
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

