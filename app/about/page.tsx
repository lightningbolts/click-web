'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';

export default function About() {
  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Navigation */}
      <nav className="relative z-10 flex items-center justify-between px-6 md:px-12 py-6 border-b border-zinc-800">
        <Link href="/" className="text-2xl font-bold">
          <span className="text-[#8338EC]">C</span>lick
        </Link>
        <Link href="/" className="text-sm hover:text-[#8338EC] transition-colors">
          ← Back to Home
        </Link>
      </nav>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-6 md:px-12 py-20">
        <motion.div
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.8 }}
        >
          <h1 className="text-5xl md:text-6xl font-bold mb-6 text-center">
            About <span className="text-[#8338EC]">Click</span>
          </h1>
          <p className="text-xl text-zinc-400 text-center max-w-3xl mx-auto mb-20 leading-relaxed">
            Building the bridge between digital and real-world connections
          </p>

          {/* Mission */}
          <section className="mb-20">
            <motion.div
              initial={{ y: 30, opacity: 0 }}
              whileInView={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.8 }}
              viewport={{ once: true }}
              className="glass p-12 md:p-16 rounded-3xl border-zinc-800"
            >
              <h2 className="text-3xl md:text-4xl font-bold mb-6 text-center">Our Mission</h2>
              <p className="text-lg text-zinc-300 leading-relaxed max-w-3xl mx-auto text-center">
                We believe technology should bring people together, not isolate them behind screens.
                Click is designed to transform fleeting in-person moments into lasting friendships—no
                endless feeds, no doomscrolling, no algorithms deciding who matters. Just real people,
                real moments, and real connections.
              </p>
            </motion.div>
          </section>

          {/* The Problem */}
          <section className="mb-20">
            <h2 className="text-3xl md:text-4xl font-bold mb-12 text-center">
              The <span className="text-[#8338EC]">Connection Graveyard</span>
            </h2>
            <div className="grid md:grid-cols-2 gap-8">
              <motion.div
                initial={{ x: -30, opacity: 0 }}
                whileInView={{ x: 0, opacity: 1 }}
                transition={{ duration: 0.8 }}
                viewport={{ once: true }}
                className="glass p-8 rounded-3xl border-zinc-800"
              >
                <h3 className="text-2xl font-bold mb-4 text-red-400">The Problem</h3>
                <p className="text-zinc-300 leading-relaxed">
                  You meet someone interesting at an event. You exchange Instagrams or Snapchats.
                  You follow each other. And then... nothing. The connection dies in the infinite
                  scroll of social media feeds. You become another face in their follower count.
                </p>
              </motion.div>

              <motion.div
                initial={{ x: 30, opacity: 0 }}
                whileInView={{ x: 0, opacity: 1 }}
                transition={{ duration: 0.8 }}
                viewport={{ once: true }}
                className="glass p-8 rounded-3xl border-zinc-800"
              >
                <h3 className="text-2xl font-bold mb-4 text-[#8338EC]">Our Solution</h3>
                <p className="text-zinc-300 leading-relaxed">
                  Click creates intentional connections. The 30-minute vibe check forces real
                  conversation in the moment. Contextual tagging helps you remember not just who
                  someone is, but where and when you connected. It's technology that respects the
                  real world.
                </p>
              </motion.div>
            </div>
          </section>

          {/* The Team */}
          <section className="mb-20">
            <h2 className="text-3xl md:text-4xl font-bold mb-6 text-center">
              Meet the <span className="text-[#8338EC]">Team</span>
            </h2>
            <p className="text-zinc-400 text-center mb-12 max-w-2xl mx-auto">
              Click is a project taken on by three Computer Science students at the University of Washington.
              Our vision is for Click to empower students to better connect in the future, making massive
              transitions seamless.
            </p>

            <div className="grid md:grid-cols-3 gap-8">
              {/* Kairui */}
              <motion.div
                initial={{ y: 30, opacity: 0 }}
                whileInView={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.8, delay: 0.1 }}
                viewport={{ once: true }}
                className="glass p-8 rounded-3xl border-zinc-800 text-center hover:border-[#8338EC] transition-colors"
              >
                <div className="w-24 h-24 rounded-full bg-gradient-to-br from-[#8338EC] to-purple-600 mx-auto mb-6 flex items-center justify-center text-4xl font-bold">
                  K
                </div>
                <h3 className="text-2xl font-bold mb-2">Kairui Cheng</h3>
                <p className="text-zinc-400 mb-4">Computer Science</p>
                <a
                  href="mailto:kcheng29@uw.edu"
                  className="text-[#8338EC] hover:underline text-sm"
                >
                  kcheng29@uw.edu
                </a>
              </motion.div>

              {/* Matthew */}
              <motion.div
                initial={{ y: 30, opacity: 0 }}
                whileInView={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.8, delay: 0.2 }}
                viewport={{ once: true }}
                className="glass p-8 rounded-3xl border-zinc-800 text-center hover:border-[#8338EC] transition-colors"
              >
                <div className="w-24 h-24 rounded-full bg-gradient-to-br from-purple-600 to-pink-600 mx-auto mb-6 flex items-center justify-center text-4xl font-bold">
                  M
                </div>
                <h3 className="text-2xl font-bold mb-2">Matthew Epshtein</h3>
                <p className="text-zinc-400 mb-4">Computer Science</p>
                <a
                  href="mailto:mepsht@uw.edu"
                  className="text-[#8338EC] hover:underline text-sm"
                >
                  mepsht@uw.edu
                </a>
              </motion.div>

              {/* Rayan */}
              <motion.div
                initial={{ y: 30, opacity: 0 }}
                whileInView={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.8, delay: 0.3 }}
                viewport={{ once: true }}
                className="glass p-8 rounded-3xl border-zinc-800 text-center hover:border-[#8338EC] transition-colors"
              >
                <div className="w-24 h-24 rounded-full bg-gradient-to-br from-pink-600 to-red-600 mx-auto mb-6 flex items-center justify-center text-4xl font-bold">
                  R
                </div>
                <h3 className="text-2xl font-bold mb-2">Rayan Rizwan</h3>
                <p className="text-zinc-400 mb-4">Computer Science</p>
                <a
                  href="mailto:rayanr@uw.edu"
                  className="text-[#8338EC] hover:underline text-sm"
                >
                  rayanr@uw.edu
                </a>
              </motion.div>
            </div>
          </section>

          {/* Our Values */}
          <section className="mb-20">
            <h2 className="text-3xl md:text-4xl font-bold mb-12 text-center">
              Our <span className="text-[#8338EC]">Values</span>
            </h2>
            <div className="grid md:grid-cols-2 gap-8">
              <motion.div
                initial={{ y: 30, opacity: 0 }}
                whileInView={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.8, delay: 0.1 }}
                viewport={{ once: true }}
                className="glass p-8 rounded-3xl border-zinc-800"
              >
                <div className="text-4xl mb-4">🛡️</div>
                <h3 className="text-xl font-bold mb-3">Privacy First</h3>
                <p className="text-zinc-400 leading-relaxed">
                  Your data is yours. We don't track you, sell your information, or build
                  advertising profiles. End-to-end encryption for messages. Anonymized analytics only.
                </p>
              </motion.div>

              <motion.div
                initial={{ y: 30, opacity: 0 }}
                whileInView={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.8, delay: 0.2 }}
                viewport={{ once: true }}
                className="glass p-8 rounded-3xl border-zinc-800"
              >
                <div className="text-4xl mb-4">🌍</div>
                <h3 className="text-xl font-bold mb-3">Real-World First</h3>
                <p className="text-zinc-400 leading-relaxed">
                  Technology should bridge to the real world, not replace it. No endless feeds,
                  no doomscrolling. Just tools to help you remember and nurture real connections.
                </p>
              </motion.div>

              <motion.div
                initial={{ y: 30, opacity: 0 }}
                whileInView={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.8, delay: 0.3 }}
                viewport={{ once: true }}
                className="glass p-8 rounded-3xl border-zinc-800"
              >
                <div className="text-4xl mb-4">⚡</div>
                <h3 className="text-xl font-bold mb-3">Intentional Design</h3>
                <p className="text-zinc-400 leading-relaxed">
                  Every feature is designed with purpose. The 30-minute vibe check creates urgency.
                  Contextual tagging builds memory. No gamification, no dark patterns.
                </p>
              </motion.div>

              <motion.div
                initial={{ y: 30, opacity: 0 }}
                whileInView={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.8, delay: 0.4 }}
                viewport={{ once: true }}
                className="glass p-8 rounded-3xl border-zinc-800"
              >
                <div className="text-4xl mb-4">🎓</div>
                <h3 className="text-xl font-bold mb-3">Student-Driven</h3>
                <p className="text-zinc-400 leading-relaxed">
                  Built by students who understand the struggle of making friends in new environments.
                  We're solving our own problem—and hopefully helping millions do the same.
                </p>
              </motion.div>
            </div>
          </section>

          {/* The Vision */}
          <section>
            <motion.div
              initial={{ y: 30, opacity: 0 }}
              whileInView={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.8 }}
              viewport={{ once: true }}
              className="glass p-12 md:p-16 rounded-3xl border-zinc-800 text-center"
            >
              <h2 className="text-3xl md:text-4xl font-bold mb-6">
                Building the <span className="text-[#8338EC]">Connection Economy</span>
              </h2>
              <p className="text-lg text-zinc-300 leading-relaxed max-w-3xl mx-auto mb-8">
                We envision a world where technology strengthens real-world relationships instead of
                replacing them. Where meeting someone new doesn't mean adding another follower, but
                starting a real friendship. Where social apps are tools, not traps.
              </p>
              <p className="text-xl font-semibold text-[#8338EC]">
                Join us. Launch 2026.
              </p>
            </motion.div>
          </section>
        </motion.div>
      </div>
    </div>
  );
}

