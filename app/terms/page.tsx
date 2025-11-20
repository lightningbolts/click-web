'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';

export default function TermsOfService() {
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
            Terms of <span className="text-[#8338EC]">Service</span>
          </h1>
          <p className="text-zinc-400 mb-12">Last updated: December 2025</p>

          <div className="space-y-8 text-zinc-300 leading-relaxed">
            <section>
              <h2 className="text-2xl font-bold text-white mb-4">Welcome to Click</h2>
              <p>
                By using Click, you agree to these terms. We've tried to keep them simple and
                human-readable because we respect your time. If something isn't clear, reach out
                to us.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4">The Service</h2>
              <p>
                Click is a connection platform designed to transform in-person meetings into
                lasting digital connections. We provide:
              </p>
              <ul className="mt-4 space-y-3 list-disc list-inside">
                <li>NFC/QR-based instant profile exchange</li>
                <li>30-minute timed "vibe check" conversations</li>
                <li>Contextual tagging (where and when you met)</li>
                <li>Privacy-first, ad-free experience</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4">Your Account</h2>
              <ul className="space-y-3 list-disc list-inside">
                <li>You must be 13 or older to use Click</li>
                <li>You're responsible for keeping your account secure</li>
                <li>One account per person - no bots, fake accounts, or spam</li>
                <li>You can delete your account at any time</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4">Community Guidelines</h2>
              <p className="mb-4">Click is about real connections. We don't tolerate:</p>
              <ul className="space-y-3 list-disc list-inside">
                <li>Harassment, bullying, or hate speech</li>
                <li>Spam, scams, or misleading content</li>
                <li>Impersonation or identity theft</li>
                <li>Sharing explicit content without consent</li>
                <li>Attempting to circumvent the 30-minute vibe check feature</li>
              </ul>
              <p className="mt-4">
                Violations may result in account suspension or termination.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4">The 30-Minute Vibe Check</h2>
              <p>
                Conversations are automatically deleted after 30 minutes unless both parties
                choose to save the connection. This is a core feature, not a bug. It's designed
                to create authentic interactions without the pressure of permanence.
              </p>
              <ul className="mt-4 space-y-3 list-disc list-inside">
                <li>Both users must opt-in to save a conversation</li>
                <li>Deleted conversations cannot be recovered</li>
                <li>Screenshots are discouraged but technically possible - be respectful</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4">Your Content</h2>
              <p>
                You own the content you share on Click. By using the service, you grant us
                a limited license to:
              </p>
              <ul className="mt-4 space-y-3 list-disc list-inside">
                <li>Display your profile to connections you've approved</li>
                <li>Store messages temporarily (30 minutes or until saved)</li>
                <li>Use anonymized, aggregated data for analytics</li>
              </ul>
              <p className="mt-4">
                We will never use your content for advertising or sell it to third parties.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4">Business Accounts</h2>
              <p>
                Organizations can use Click to facilitate connections at events. Business accounts
                receive aggregated analytics about connection patterns, but never individual user data.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4">Disclaimers</h2>
              <ul className="space-y-3 list-disc list-inside">
                <li>Click is provided "as is" without warranties of any kind</li>
                <li>We're not responsible for the behavior of other users</li>
                <li>We may modify or discontinue features with notice</li>
                <li>We're not liable for lost data, though we'll do our best to prevent it</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4">Changes to Terms</h2>
              <p>
                We may update these terms as Click evolves. We'll notify you of significant
                changes via email and in-app notification. Continued use after changes means
                you accept the new terms.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4">Termination</h2>
              <p>
                You can stop using Click at any time. We can suspend or terminate accounts that
                violate these terms. If we terminate your account, we'll provide a reason unless
                prohibited by law.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4">The Legal Stuff</h2>
              <ul className="space-y-3 list-disc list-inside">
                <li>These terms are governed by Washington State law</li>
                <li>Disputes will be resolved through arbitration, not class action lawsuits</li>
                <li>If any provision is unenforceable, the rest still applies</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4">Contact Us</h2>
              <p>Questions about these terms? Reach out:</p>
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

            <section className="border-t border-zinc-800 pt-8 mt-8">
              <p className="text-zinc-500 text-sm">
                By using Click, you acknowledge that you've read, understood, and agree to be
                bound by these Terms of Service and our Privacy Policy.
              </p>
            </section>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

