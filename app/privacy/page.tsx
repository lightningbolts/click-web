'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { PAGE_COLUMN_CLASS } from '@/lib/shell/pageColumn';

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-background text-on-surface">

      {/* Content */}
      <div className={`${PAGE_COLUMN_CLASS} py-20`}>
        <motion.div
          initial={false}
          animate={{ y: 0, opacity: 1 }}
        >
          <h1 id="privacy-heading" data-testid="privacy-heading" className="text-5xl md:text-6xl font-bold mb-6">
            Privacy <span className="text-primary">Policy</span>
          </h1>
          <p className="text-on-surface-variant mb-12">Last updated: April 2026</p>

          <div className="space-y-8 text-on-surface leading-relaxed">
            <section>
              <h2 className="text-2xl font-bold text-on-surface mb-4">Our Privacy Promise</h2>
              <p>
                Click is built on a simple conviction: your social life is nobody else&apos;s business.
                We collect the minimum data needed to make the product work, we never sell your data,
                and we delete it when it&apos;s no longer needed. Privacy isn&apos;t a feature; it&apos;s the
                foundation.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-on-surface mb-4">Data We Collect</h2>
              <p className="mb-4">We collect only what&apos;s necessary to power Click:</p>
              <ul className="space-y-3 list-disc list-inside">
                <li><strong className="text-on-surface">Account info:</strong> Email address and display name</li>
                <li><strong className="text-on-surface">Interest tags:</strong> Self-selected interests you choose during onboarding</li>
                <li><strong className="text-on-surface">Connection data:</strong> Records of who you connected with, when, and where (semantic location only, e.g. &quot;Coffee Lab&quot;, not GPS coordinates)</li>
                <li><strong className="text-on-surface">Messages:</strong> Chat messages sent during active connections</li>
                <li>
                  <strong className="text-on-surface">Device info:</strong> Platform (iOS/Android), Bluetooth and microphone-related
                  signals used only to perform co-presence checks and handshakes you initiate, not for continuous recording or
                  ambient surveillance
                </li>
                <li>
                  <strong className="text-on-surface">Availability intents:</strong> The intent labels and time window you set when
                  you choose to broadcast (for example up to 24 hours), and records needed to match overlaps with connections
                  you already have
                </li>
              </ul>
              <p className="mt-4">
                We do <strong className="text-on-surface">not</strong> collect: precise GPS location history, contacts, photos,
                browsing history, advertising identifiers, or any data from other apps on your device.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-on-surface mb-4">How We Use Your Data</h2>
              <ul className="space-y-3 list-disc list-inside">
                <li>
                  Display your profile to people you connect with after you both complete the same-room or group verification
                  flow (Proximity Tap or Multi-Tap), or through other explicit connection methods we offer
                </li>
                <li>Match availability intents among your connections when you opt in and notify you of overlaps</li>
                <li>Show Common Ground interest overlaps when you meet someone</li>
                <li>Power the 48-hour &quot;Say Hi&quot; window and connection lifecycle</li>
                <li>Store messages during the connection lifecycle (deleted on expiry)</li>
                <li>Generate anonymized, aggregated analytics for business partners (never individual data)</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-on-surface mb-4">Data Retention &amp; Deletion</h2>
              <p className="mb-4">
                Deletion is a feature, not a flaw. Here&apos;s exactly when your data is removed:
              </p>
              <ul className="space-y-3 list-disc list-inside">
                <li><strong className="text-on-surface">Pending connections:</strong> Auto-deleted after 48 hours if no message is sent</li>
                <li><strong className="text-on-surface">Active connections:</strong> Auto-deleted after 7 days of no messages (unless both users tap &quot;Keep&quot;)</li>
                <li><strong className="text-on-surface">Kept connections:</strong> Stored permanently until either user deletes the connection</li>
                <li><strong className="text-on-surface">Messages:</strong> Deleted when the parent connection expires or is deleted</li>
                <li><strong className="text-on-surface">Account deletion:</strong> All data permanently removed within 30 days</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-on-surface mb-4">B2B Anonymization Guarantee</h2>
              <p className="mb-4">
                Click offers anonymized analytics to venue partners (&quot;Insights&quot;). Here&apos;s what they can see:
              </p>
              <ul className="space-y-3 list-disc list-inside">
                <li>Total connection count by day and hour; <strong className="text-on-surface">never</strong> individual identities</li>
                <li>Aggregated interest tag distributions; <strong className="text-on-surface">never</strong> which specific users</li>
                <li>Kept ratio (percentage of connections that become permanent); <strong className="text-on-surface">never</strong> which connections</li>
                <li>
                  Where enabled, aggregated signals about verified group arrivals (micro-communities) and geographic summaries
                  of availability intents (for example category counts in a map or hexbin view); <strong className="text-on-surface">never</strong>{' '}
                  tied to your name, email, or exact one-to-one location trail in partner dashboards
                </li>
              </ul>
              <p className="mt-4">
                All analytics queries aggregate before returning data. No user IDs,
                names, or emails are ever included in Insights API responses.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-on-surface mb-4">Third Parties</h2>
              <ul className="space-y-3 list-disc list-inside">
                <li><strong className="text-on-surface">Supabase:</strong> Database and authentication provider (SOC 2 Type II compliant)</li>
                <li><strong className="text-on-surface">Vercel:</strong> Website hosting and analytics (page views only, no personal data)</li>
              </ul>
              <p className="mt-4">
                We do not use ad networks, data brokers, or third-party tracking SDKs.
                We will never sell, rent, or share your personal data with advertisers.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-on-surface mb-4">Your Rights</h2>
              <p className="mb-4">You have the right to:</p>
              <ul className="space-y-3 list-disc list-inside">
                <li><strong className="text-on-surface">Access:</strong> Request a copy of all data we hold about you</li>
                <li><strong className="text-on-surface">Correct:</strong> Update your profile information at any time</li>
                <li><strong className="text-on-surface">Delete:</strong> Delete your account and all associated data</li>
                <li><strong className="text-on-surface">Port:</strong> Export your connections list</li>
                <li><strong className="text-on-surface">Object:</strong> Opt out of anonymized analytics inclusion</li>
              </ul>
              <p className="mt-4">
                To exercise any of these rights, email us at the addresses below.
                We&apos;ll respond within 30 days.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-on-surface mb-4">Children&apos;s Privacy</h2>
              <p>
                Click is not intended for users under 13. We do not knowingly collect data
                from children. If you believe a child under 13 is using Click, contact us
                and we will delete their account.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-on-surface mb-4">Security</h2>
              <p>
                We use industry-standard encryption for all data transmission. Our
                database provider (Supabase) is SOC 2 Type II compliant. We regularly audit
                our security practices and will notify you promptly of any breach.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-on-surface mb-4">Changes to This Policy</h2>
              <p>
                We&apos;ll notify you of material changes via email and in-app notification
                at least 14 days before they take effect.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-on-surface mb-4">Contact Us</h2>
              <p>Questions about privacy? Reach out:</p>
              <div className="mt-4 space-y-2">
                <p>
                  <a href="mailto:mepsht@uw.edu" className="text-primary hover:underline">
                    mepsht@uw.edu
                  </a>
                </p>
                <p>
                  <a href="mailto:kcheng29@uw.edu" className="text-primary hover:underline">
                    kcheng29@uw.edu
                  </a>
                </p>
                <p>
                  <a href="mailto:rayanr@uw.edu" className="text-primary hover:underline">
                    rayanr@uw.edu
                  </a>
                </p>
              </div>
            </section>

            <section className="border-t border-border-hard pt-8 mt-8">
              <p className="text-on-surface-variant text-sm">
                By using Click, you acknowledge that you&apos;ve read, understood, and agree to this
                Privacy Policy and our{' '}
                <Link href="/terms" className="text-primary hover:underline">
                  Terms of Service
                </Link>.
              </p>
            </section>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
