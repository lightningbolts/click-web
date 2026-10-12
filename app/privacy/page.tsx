import Link from "next/link";
import type { Metadata } from "next";
import {
  LegalDocument,
  LegalSection,
} from "@/components/marketing/LegalDocument";

export const metadata: Metadata = {
  title: "Privacy Policy · Click",
  description: "How Click collects, uses, keeps and deletes your data.",
};

export default function PrivacyPolicy() {
  return (
    <LegalDocument
      id="privacy-heading"
      title="Privacy Policy"
      updated="October 2026"
      closing={
        <>
          By using Click, you acknowledge that you&apos;ve read, understood, and
          agree to this Privacy Policy and our{" "}
          <Link href="/terms">Terms of Service</Link>.
        </>
      }
    >
      <LegalSection title="Our Privacy Promise">
        <p>
          Click is built on a simple conviction: your social life is nobody
          else&apos;s business. We collect the minimum data needed to make the
          product work, we never sell your data, and we delete it when it&apos;s
          no longer needed. Privacy isn&apos;t a feature; it&apos;s the
          foundation.
        </p>
      </LegalSection>

      <LegalSection title="Data We Collect">
        <p>We collect only what&apos;s necessary to power Click:</p>
        <ul>
          <li>
            <strong>Account info:</strong> Email address and display name
          </li>
          <li>
            <strong>Interest tags:</strong> Self-selected interests you choose
            during onboarding
          </li>
          <li>
            <strong>Connection data:</strong> Records of who you connected with,
            when, and where (semantic location only, e.g. &quot;Coffee
            Lab&quot;, not GPS coordinates)
          </li>
          <li>
            <strong>Messages:</strong> Chat messages sent during active
            connections
          </li>
          <li>
            <strong>Device info:</strong> Platform (iOS/Android), Bluetooth and
            microphone-related signals used only to perform co-presence checks
            and handshakes you initiate, not for continuous recording or ambient
            surveillance
          </li>
          <li>
            <strong>Availability intents:</strong> The intent labels and time
            window you set when you choose to broadcast (for example up to 24
            hours), and records needed to match overlaps with connections you
            already have
          </li>
        </ul>
        <p>
          We do <strong>not</strong> collect: precise GPS location history,
          contacts, photos, browsing history, advertising identifiers, or any
          data from other apps on your device.
        </p>
      </LegalSection>

      <LegalSection title="How We Use Your Data">
        <ul>
          <li>
            Display your profile to people you connect with after you both
            complete the same-room or group verification flow (Proximity Tap or
            Multi-Tap), or through other explicit connection methods we offer
          </li>
          <li>
            Match availability intents among your connections when you opt in
            and notify you of overlaps
          </li>
          <li>Show Common Ground interest overlaps when you meet someone</li>
          <li>
            Power the 48-hour &quot;Say Hi&quot; window and connection lifecycle
          </li>
          <li>
            Store messages during the connection lifecycle (deleted on expiry)
          </li>
          <li>
            Generate anonymized, aggregated analytics for business partners
            (never individual data)
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="Data Retention & Deletion">
        <p>
          Deletion is a feature, not a flaw. Here&apos;s exactly when your data
          is removed:
        </p>
        <ul>
          <li>
            <strong>Pending connections:</strong> Auto-deleted after 48 hours if
            no message is sent
          </li>
          <li>
            <strong>Active connections:</strong> Auto-deleted after 7 days of no
            messages (unless both users tap &quot;Keep&quot;)
          </li>
          <li>
            <strong>Kept connections:</strong> Stored permanently until either
            user deletes the connection
          </li>
          <li>
            <strong>Messages:</strong> Deleted when the parent connection
            expires or is deleted
          </li>
          <li>
            <strong>Account deletion:</strong> All data permanently removed
            within 30 days
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="B2B Anonymization Guarantee">
        <p>
          Click offers anonymized analytics to venue partners
          (&quot;Insights&quot;). Here&apos;s what they can see:
        </p>
        <ul>
          <li>
            Total connection count by day and hour; <strong>never</strong>{" "}
            individual identities
          </li>
          <li>
            Aggregated interest tag distributions; <strong>never</strong> which
            specific users
          </li>
          <li>
            Kept ratio (percentage of connections that become permanent);{" "}
            <strong>never</strong> which connections
          </li>
          <li>
            Where enabled, aggregated signals about verified group arrivals
            (micro-communities) and geographic summaries of availability intents
            (for example category counts in a map or hexbin view);{" "}
            <strong>never</strong> tied to your name, email, or exact one-to-one
            location trail in partner dashboards
          </li>
        </ul>
        <p>
          All analytics queries aggregate before returning data. No user IDs,
          names, or emails are ever included in Insights API responses.
        </p>
      </LegalSection>

      <LegalSection title="Third Parties">
        <ul>
          <li>
            <strong>Supabase:</strong> Database and authentication provider (SOC
            2 Type II compliant)
          </li>
          <li>
            <strong>Cloudflare:</strong> Website hosting and delivery. To serve
            and protect the site, Cloudflare processes request data such as IP
            addresses. We also use Cloudflare Web Analytics, which is cookieless
            and measures page views and page performance, not individual
            visitors.
          </li>
        </ul>
        <p>
          We do not use ad networks, data brokers, or third-party tracking SDKs.
          We will never sell, rent, or share your personal data with
          advertisers.
        </p>
      </LegalSection>

      <LegalSection title="Your Rights">
        <p>You have the right to:</p>
        <ul>
          <li>
            <strong>Access:</strong> Request a copy of all data we hold about
            you
          </li>
          <li>
            <strong>Correct:</strong> Update your profile information at any
            time
          </li>
          <li>
            <strong>Delete:</strong> Delete your account and all associated data
          </li>
          <li>
            <strong>Port:</strong> Export your connections list
          </li>
          <li>
            <strong>Object:</strong> Opt out of anonymized analytics inclusion
          </li>
        </ul>
        <p>
          To exercise any of these rights, email us at the addresses below.
          We&apos;ll respond within 30 days.
        </p>
      </LegalSection>

      <LegalSection title="Children’s Privacy">
        <p>
          Click is not intended for users under 13. We do not knowingly collect
          data from children. If you believe a child under 13 is using Click,
          contact us and we will delete their account.
        </p>
      </LegalSection>

      <LegalSection title="Security">
        <p>
          We use industry-standard encryption for all data transmission. Our
          database provider (Supabase) is SOC 2 Type II compliant. We regularly
          audit our security practices and will notify you promptly of any
          breach.
        </p>
      </LegalSection>

      <LegalSection title="Changes to This Policy">
        <p>
          We&apos;ll notify you of material changes via email and in-app
          notification at least 14 days before they take effect.
        </p>
      </LegalSection>

      <LegalSection title="Contact Us">
        <p>Questions about privacy? Reach out:</p>
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
