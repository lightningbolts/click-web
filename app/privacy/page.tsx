'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-zinc-950 text-white">

      {/* Content */}
      <div className="max-w-4xl mx-auto px-6 md:px-12 py-20">
        <motion.div
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.8 }}
        >
          <h1 className="text-5xl md:text-6xl font-bold mb-6">
            Privacy <span className="text-[#8338EC]">Policy</span>
          </h1>
          <p className="text-zinc-400 mb-12">Last updated: December 2025</p>

          <div className="space-y-8 text-zinc-300 leading-relaxed">
            <section>
              <h2 className="text-2xl font-bold text-white mb-4">Our Commitment</h2>
              <p>
                At Click, we believe your data is yours. Period. We're building a connection platform,
                not an advertising machine. This privacy policy explains how we collect, use, and protect
                your information.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4">What We Collect</h2>
              <ul className="space-y-3 list-disc list-inside">
                <li>
                  <strong>Account Information:</strong> Email address, display name, and profile picture (optional)
                </li>
                <li>
                  <strong>Connection Data:</strong> Information about when and where you connected with others (stored locally on your device)
                </li>
                <li>
                  <strong>Usage Analytics:</strong> Anonymized data about app performance and feature usage
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4">What We DON'T Collect</h2>
              <ul className="space-y-3 list-disc list-inside">
                <li>We don't track your location continuously</li>
                <li>We don't read your messages (they're end-to-end encrypted)</li>
                <li>We don't sell your data to advertisers</li>
                <li>We don't build shadow profiles or track you across other apps</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4">How We Use Your Data</h2>
              <p className="mb-4">We use your information only to:</p>
              <ul className="space-y-3 list-disc list-inside">
                <li>Enable you to connect with people you meet in real life</li>
                <li>Facilitate the 30-minute vibe check conversations</li>
                <li>Improve app performance and fix bugs</li>
                <li>Send you important updates about the service (you can opt out)</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4">Business Insights</h2>
              <p>
                For organizations using Click at events, we provide aggregated, anonymized analytics
                about connection density and event engagement. Individual user data is never shared.
                All reports show trends and patterns, not individual behaviors.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4">Data Retention</h2>
              <ul className="space-y-3 list-disc list-inside">
                <li>Vibe check chats are deleted after 30 minutes unless both parties save them</li>
                <li>Connection context (where you met) is stored on your device, not our servers</li>
                <li>You can delete your account and all associated data at any time</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4">Your Rights</h2>
              <p className="mb-4">You have the right to:</p>
              <ul className="space-y-3 list-disc list-inside">
                <li>Access all data we have about you</li>
                <li>Request deletion of your data</li>
                <li>Export your connection history</li>
                <li>Opt out of analytics collection</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4">Security</h2>
              <p>
                We use industry-standard encryption for all data transmission and storage.
                Your messages are end-to-end encrypted. We regularly audit our security practices
                and will notify you immediately of any breach.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4">Changes to This Policy</h2>
              <p>
                We'll notify you of any material changes to this privacy policy via email and
                in-app notification. Your continued use of Click after changes constitutes acceptance.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4">Contact Us</h2>
              <p>Questions about privacy? Email us at:</p>
              <div className="mt-4 space-y-2">
                <p>
                  <a href="mailto:mepsht@uw.edu" className="text-[#8338EC] hover:underline">
                    mepsht@uw.edu
                  </a>
                </p>
                <p>
                  <a href="mailto:kcheng29@uw.edu" className="text-[#8338EC] hover:underline">
                    kcheng29@uw.edu
                  </a>
                </p>
                <p>
                  <a href="mailto:rayanr@uw.edu" className="text-[#8338EC] hover:underline">
                    rayanr@uw.edu
                  </a>
                </p>
              </div>
            </section>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

