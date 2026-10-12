import Link from "next/link";
import type { Metadata } from "next";
import {
  LegalDocument,
  LegalSection,
} from "@/components/marketing/LegalDocument";

export const metadata: Metadata = {
  title: "Terms of Service · Click",
  description: "The terms for using Click.",
};

export default function TermsOfService() {
  return (
    <LegalDocument
      id="terms-heading"
      title="Terms of Service"
      updated="October 2026"
      closing={
        <>
          By using Click, you acknowledge that you&apos;ve read, understood, and
          agree to be bound by these Terms of Service and our{" "}
          <Link href="/privacy">Privacy Policy</Link>.
        </>
      }
    >
      <LegalSection title="Welcome to Click">
        <p>
          By using Click, you agree to these terms. We’ve tried to keep them
          simple and human-readable because we respect your time. If something
          isn’t clear, reach out to us.
        </p>
      </LegalSection>

      <LegalSection title="The Service">
        <p>
          Click is a connection platform designed to transform in-person
          meetings into lasting digital connections. We provide:
        </p>
        <ul>
          <li>
            Proximity Tap: co-presence verification (for example Bluetooth and
            inaudible audio) before instant profile exchange; optional
            connection methods such as QR may also be offered where available
          </li>
          <li>
            Multi-Tap: synchronized group connections and verified group chats
            where the product supports them
          </li>
          <li>
            Availability intents: time-limited signals you choose to share with
            your connections
          </li>
          <li>48-hour &quot;Say Hi&quot; window to start conversations</li>
          <li>Optional 30-minute &quot;Vibe Check&quot; for live chats</li>
          <li>Contextual tagging (where and when you met)</li>
          <li>Privacy-first, ad-free experience</li>
        </ul>
      </LegalSection>

      <LegalSection title="Your Account">
        <ul>
          <li>You must be 13 or older to use Click</li>
          <li>You’re responsible for keeping your account secure</li>
          <li>One account per person - no bots, fake accounts, or spam</li>
          <li>You can delete your account at any time</li>
        </ul>
      </LegalSection>

      <LegalSection title="Community Guidelines">
        <p>
          Click is about real connections. We have zero tolerance for
          objectionable content or abusive users. That includes:
        </p>
        <ul>
          <li>Harassment, bullying, or hate speech</li>
          <li>Spam, scams, or misleading content</li>
          <li>Impersonation or identity theft</li>
          <li>Sexually explicit, violent, or graphic content</li>
          <li>Threats, or encouraging self-harm or violence</li>
          <li>Attempting to circumvent connection expiry features</li>
        </ul>
        <p>
          You can report any person, message, photo, or event from inside the
          app, and block anyone so they can no longer reach you. We review
          reports within 24 hours, remove content that breaks these guidelines,
          and suspend or permanently remove the accounts responsible.
        </p>
      </LegalSection>

      <LegalSection title="Connections & Expiry">
        <p>
          Click uses a multi-stage connection model to encourage authentic
          interactions:
        </p>
        <ul>
          <li>
            New connections start with a 48-hour &quot;Say Hi&quot; window: send
            a message to activate the connection
          </li>
          <li>
            Active connections stay open as long as messages are exchanged
            within a 7-day rolling window
          </li>
          <li>
            Both users can choose to &quot;Keep&quot; a connection, making it
            permanent
          </li>
          <li>
            An optional 30-minute Vibe Check is available for real-time
            conversations
          </li>
          <li>
            Expired connections and their messages are permanently deleted
          </li>
          <li>
            Screenshots are discouraged but technically possible; be respectful
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="Your Content">
        <p>
          You own the content you share on Click. By using the service, you
          grant us a limited license to:
        </p>
        <ul>
          <li>Display your profile to connections you’ve approved</li>
          <li>
            Store messages temporarily (during connection lifecycle or until
            kept)
          </li>
          <li>Use anonymized, aggregated data for analytics</li>
        </ul>
        <p>
          We will never use your content for advertising or sell it to third
          parties.
        </p>
      </LegalSection>

      <LegalSection title="Business Accounts">
        <p>
          Organizations can use Click to facilitate connections at events.
          Verified business accounts may receive aggregated analytics about
          connection patterns, including where the product offers them, signals
          such as verified group arrivals and anonymized availability-intent
          summaries (for example Vibe Radar). Partners receive aggregate or
          operational insight consistent with your settings and applicable law,
          not individual user identities in Insights.
        </p>
      </LegalSection>

      <LegalSection title="Disclaimers">
        <ul>
          <li>Click is provided “as is” without warranties of any kind</li>
          <li>We’re not responsible for the behavior of other users</li>
          <li>We may modify or discontinue features with notice</li>
          <li>
            We’re not liable for lost data, though we’ll do our best to prevent
            it
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="Changes to Terms">
        <p>
          We may update these terms as Click evolves. We’ll notify you of
          significant changes via email and in-app notification. Continued use
          after changes means you accept the new terms.
        </p>
      </LegalSection>

      <LegalSection title="Termination">
        <p>
          You can stop using Click at any time. We can suspend or terminate
          accounts that violate these terms. If we terminate your account, we’ll
          provide a reason unless prohibited by law.
        </p>
      </LegalSection>

      <LegalSection title="The Legal Stuff">
        <ul>
          <li>These terms are governed by Washington State law</li>
          <li>
            Disputes will be resolved through arbitration, not class action
            lawsuits
          </li>
          <li>If any provision is unenforceable, the rest still applies</li>
        </ul>
      </LegalSection>

      <LegalSection title="Contact Us">
        <p>Questions about these terms? Reach out:</p>
        <div className="flex flex-col gap-1">
          <p>
            <a href="mailto:mepsht@uw.edu">mepsht@uw.edu</a>
          </p>
          <p>
            <a href="mailto:kcheng29@uw.edu">kcheng29@uw.edu</a>
          </p>
          <p>
            <a href="mailto:rayanr@uw.edu">rayanr@uw.edu</a>
          </p>
        </div>
      </LegalSection>
    </LegalDocument>
  );
}
