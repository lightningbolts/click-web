'use client';

import { motion } from 'framer-motion';
import { Smartphone, Zap, Shield, Users, Clock, Sparkles } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import LoginModal from '@/components/LoginModal';
import UserProfile from '@/components/UserProfile';
import { useAuth } from '@/lib/AuthContext';

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoginOpen, setIsLoginOpen] = useState(false);

  // Redirect to dashboard if user is logged in
  useEffect(() => {
    if (!loading && user) {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const response = await fetch('/api/waitlist', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      if (response.ok) {
        setIsSubmitted(true);
      }
    } catch (error) {
      console.error('Error joining waitlist:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white overflow-hidden">
      {/* Background gradient effects */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-[#8338EC] rounded-full blur-[120px] opacity-20" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-[#8338EC] rounded-full blur-[120px] opacity-20" />
      </div>

      {/* Navigation */}
      <motion.nav
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6 }}
        className="relative z-10 flex items-center justify-between px-4 md:px-12 py-6 gap-2"
      >
        <div className="text-xl md:text-2xl font-bold flex-shrink-0">
          <span className="text-[#8338EC]">C</span>lick
        </div>
        <div className="flex items-center gap-2 md:gap-6">
          <button
            onClick={() => {
              const missionSection = document.getElementById('mission');
              missionSection?.scrollIntoView({ behavior: 'smooth' });
            }}
            className="text-xs md:text-sm hover:text-[#8338EC] transition-colors"
          >
            Mission
          </button>
          <a href="/about" className="text-xs md:text-sm hover:text-[#8338EC] transition-colors">
            About
          </a>
          {user ? (
            <UserProfile />
          ) : (
            <button
              onClick={() => setIsLoginOpen(true)}
              className="text-xs md:text-sm px-3 md:px-4 py-2 rounded-full border border-zinc-700 hover:border-[#8338EC] transition-colors"
            >
              Login
            </button>
          )}
        </div>
      </motion.nav>

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
              <span className="text-sm text-zinc-300">Launching Soon</span>
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
              <span className="text-[#8338EC] font-semibold">Click</span> transforms fleeting in-person moments into lasting friendships.
            </p>
            <p className="text-sm sm:text-base md:text-lg text-zinc-500 max-w-3xl mx-auto mb-12 leading-relaxed px-4">
              Stop collecting followers. Start building real connections with the digital handshake.
            </p>

            {/* Email Waitlist Form */}
            <motion.form
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.8, delay: 0.6 }}
              onSubmit={handleSubmit}
              className="max-w-md mx-auto px-4"
            >
              {!isSubmitted ? (
                <div className="flex flex-col sm:flex-row gap-3">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your email"
                    required
                    className="w-full sm:flex-1 glass px-6 py-3 text-white placeholder-zinc-500 focus:outline-none rounded-full text-sm sm:text-base"
                  />
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    type="submit"
                    disabled={isLoading}
                    className="w-full sm:w-auto px-8 py-3 bg-[#8338EC] hover:bg-[#9d4eff] rounded-full font-semibold transition-all glow-violet disabled:opacity-50 text-sm sm:text-base whitespace-nowrap"
                  >
                    {isLoading ? 'Joining...' : 'Join the Waitlist'}
                  </motion.button>
                </div>
              ) : (
                <motion.div
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="glass p-6 rounded-2xl"
                >
                  <p className="text-[#8338EC] font-semibold">✨ You're on the list!</p>
                  <p className="text-zinc-400 text-sm mt-2">We'll notify you when we launch.</p>
                </motion.div>
              )}
            </motion.form>
          </motion.div>
        </div>
      </section>

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
              Because great connections shouldn't be left to chance. One <span className="text-[#8338EC] font-semibold">Click</span>,
              and you've turned a fleeting moment into a lasting friendship.
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
              className="glass p-8 rounded-3xl border-zinc-800 relative overflow-hidden group"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-red-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative z-10">
                <div className="w-12 h-12 rounded-2xl bg-red-500/10 flex items-center justify-center mb-6">
                  <span className="text-2xl">💀</span>
                </div>
                <h3 className="text-xl sm:text-2xl font-bold mb-4">The Connection Graveyard</h3>
                <p className="text-sm sm:text-base text-zinc-400 leading-relaxed">
                  You meet someone at an event, swap social media, and never speak again. Sound familiar?
                </p>
              </div>
            </motion.div>

            {/* Card 2 - NFC Tap */}
            <motion.div
              whileHover={{ y: -8, scale: 1.02 }}
              transition={{ type: "spring", stiffness: 300 }}
              className="glass p-8 rounded-3xl border-zinc-800 relative overflow-hidden group"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-[#8338EC]/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative z-10">
                <div className="w-12 h-12 rounded-2xl bg-[#8338EC]/10 flex items-center justify-center mb-6">
                  <Smartphone className="w-6 h-6 text-[#8338EC]" />
                </div>
                <h3 className="text-xl sm:text-2xl font-bold mb-4">
                  <span className="text-[#8338EC]">Click</span> to Connect
                </h3>
                <p className="text-sm sm:text-base text-zinc-400 leading-relaxed">
                  Instant NFC tap to exchange profiles. Just tap phones and go. No awkward "what's your @?"
                </p>
              </div>
            </motion.div>

            {/* Card 3 - 30-Minute Vibe Check */}
            <motion.div
              whileHover={{ y: -8, scale: 1.02 }}
              transition={{ type: "spring", stiffness: 300 }}
              className="glass p-8 rounded-3xl border-zinc-800 relative overflow-hidden group md:col-span-2"
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
                      After you <span className="text-[#8338EC] font-semibold">Click</span>, start a timed chat to spark real conversation. No pressure, no permanence.
                      Deleted by default unless you both opt-in. If the vibe's right, save it.
                      If not, no harm done.
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
              className="glass p-8 rounded-3xl border-zinc-800 relative overflow-hidden group md:col-span-2"
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
                  A tool, not a trap. No doomscrolling. No ads. No algorithm deciding who matters.
                  Just real people, real moments, real connections.
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
              The digital handshake: Connection technology built for the real world
            </p>
          </motion.div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* NFC/QR Exchange */}
            <motion.div
              initial={{ y: 30, opacity: 0 }}
              whileInView={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.8, delay: 0.1 }}
              viewport={{ once: true }}
              className="glass p-8 rounded-3xl border-zinc-800 relative overflow-hidden group"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-[#8338EC]/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative z-10">
                <div className="w-16 h-16 rounded-2xl bg-[#8338EC]/10 flex items-center justify-center mb-6">
                  <Smartphone className="w-8 h-8 text-[#8338EC]" />
                </div>
                <h3 className="text-2xl font-bold mb-4">NFC/QR Exchange</h3>
                <p className="text-zinc-400 leading-relaxed mb-4">
                  The true digital handshake. Tap phones or scan QR codes to exchange profiles instantly.
                </p>
                <ul className="space-y-2 text-zinc-500 text-sm">
                  <li className="flex items-start gap-2">
                    <span className="text-[#8338EC] mt-1">✓</span>
                    <span>No searching for usernames</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-[#8338EC] mt-1">✓</span>
                    <span>Works offline, syncs later</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-[#8338EC] mt-1">✓</span>
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
              className="glass p-8 rounded-3xl border-zinc-800 relative overflow-hidden group"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-[#8338EC]/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative z-10">
                <div className="w-16 h-16 rounded-2xl bg-[#8338EC]/10 flex items-center justify-center mb-6">
                  <span className="text-3xl">📍</span>
                </div>
                <h3 className="text-2xl font-bold mb-4">Contextual Memory</h3>
                <p className="text-zinc-400 leading-relaxed mb-4">
                  Every connection remembers where and when you met. Context makes connections stick.
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
              className="glass p-8 rounded-3xl border-zinc-800 relative overflow-hidden group"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-[#8338EC]/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative z-10">
                <div className="w-16 h-16 rounded-2xl bg-[#8338EC]/10 flex items-center justify-center mb-6">
                  <span className="text-3xl">📊</span>
                </div>
                <h3 className="text-2xl font-bold mb-4">Business Insights</h3>
                <p className="text-zinc-400 leading-relaxed mb-4">
                  For organizations: See where connections happen and which events generate the most engagement.
                </p>
                <ul className="space-y-2 text-zinc-500 text-sm">
                  <li className="flex items-center gap-2">
                    <span className="text-[#8338EC]">•</span>
                    <span>Connection density heatmaps</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-[#8338EC]">•</span>
                    <span>Event analytics & pacing metrics</span>
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
            className="glass p-12 md:p-16 rounded-3xl border-zinc-800 relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-[#8338EC]/5 to-transparent" />
            <div className="relative z-10">
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-6 text-center">
                <span className="text-[#8338EC]">Click</span> is Building the{' '}
                <span className="bg-gradient-to-r from-[#8338EC] to-purple-400 bg-clip-text text-transparent">
                  Connection Economy
                </span>
              </h2>
              <p className="text-base sm:text-lg md:text-xl text-zinc-400 text-center max-w-3xl mx-auto mb-12 leading-relaxed px-4">
                We're not building another social media app. <span className="text-[#8338EC] font-semibold">Click</span> is a bridge
                between the digital and the real world.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-12">
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  className="text-center"
                >
                  <div className="w-16 h-16 rounded-2xl bg-[#8338EC]/10 flex items-center justify-center mb-4 mx-auto">
                    <Shield className="w-8 h-8 text-[#8338EC]" />
                  </div>
                  <h4 className="text-lg font-semibold mb-2">Privacy First</h4>
                  <p className="text-zinc-500 text-sm">
                    Your data stays yours. No tracking, no selling, no BS.
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
                    Created by students, for students. Launching 2026.
                  </p>
                </motion.div>

                <motion.div
                  whileHover={{ scale: 1.05 }}
                  className="text-center"
                >
                  <div className="w-16 h-16 rounded-2xl bg-[#8338EC]/10 flex items-center justify-center mb-4 mx-auto">
                    <Users className="w-8 h-8 text-[#8338EC]" />
                  </div>
                  <h4 className="text-lg font-semibold mb-2">Real-World Community</h4>
                  <p className="text-zinc-500 text-sm">
                    Technology as a bridge, not a barrier. IRL first, always.
                  </p>
                </motion.div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-50 px-6 md:px-12 py-12 border-t border-zinc-800 bg-zinc-950">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col items-center justify-center gap-6 mb-8">
            <div className="text-2xl md:text-3xl font-bold">
              <span className="text-[#8338EC]">C</span>lick
            </div>
            <div className="flex flex-wrap items-center justify-center gap-4 md:gap-6 text-sm md:text-base">
              <a href="/privacy" className="text-white hover:text-[#8338EC] transition-colors">Privacy</a>
              <span className="text-zinc-600">•</span>
              <a href="/terms" className="text-white hover:text-[#8338EC] transition-colors">Terms</a>
              <span className="text-zinc-600">•</span>
              <a href="/about" className="text-white hover:text-[#8338EC] transition-colors">About</a>
            </div>
          </div>
          <div className="text-center text-xs md:text-sm text-zinc-400 space-y-2">
            <p>Made with 💜 at UW</p>
            <p>© 2025 Click. All rights reserved.</p>
          </div>
        </div>
      </footer>

      {/* Login Modal */}
      <LoginModal isOpen={isLoginOpen} onClose={() => setIsLoginOpen(false)} />
    </div>
  );
}

