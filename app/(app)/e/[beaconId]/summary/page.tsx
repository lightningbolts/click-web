import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FileQuestion } from "lucide-react";
import { EmptyState } from "@/components/ds/EmptyState";
import { StatTile } from "@/components/ds/StatTile";
import { PrintButton } from "@/components/events/PrintButton";
import { EVENT_BEACON_UUID_RE, eventDisplayTitle } from "@/lib/events/eventMetadata";
import { formatEventWhen } from "@/lib/events/formatEventWhen";
import { createAdminSupabaseClient } from "@/lib/server/admin/supabaseAdmin";
import { loadPublishedSummary } from "@/lib/server/events/loadPublishedSummary";
import { summaryHighlights } from "@/lib/events/summaryHighlights";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Event summary · Click", robots: { index: false, follow: false } };

/** Public, token-gated event report (spec §7.6.5): aggregate numbers only, printable. */
export default async function EventSummaryPage({
  params,
  searchParams,
}: {
  params: Promise<{ beaconId: string }>;
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const [{ beaconId }, sp] = await Promise.all([params, searchParams]);
  if (!EVENT_BEACON_UUID_RE.test(beaconId)) notFound();
  const token = typeof sp.token === "string" ? sp.token.trim() : "";
  const summary = await loadPublishedSummary(createAdminSupabaseClient(), beaconId, token);

  if (summary == null) {
    return (
      <div className="container-content py-16">
        <h1 className="sr-only">Event summary</h1>
        <EmptyState
          icon={FileQuestion}
          title="This summary isn’t available"
          body="The link may be incomplete, or the host hasn’t published a summary. Ask the host for a new link."
        />
      </div>
    );
  }

  const title = eventDisplayTitle(summary.title);
  const when = formatEventWhen(summary.event_start_at, summary.event_end_at, summary.timezone);
  const highlights = summaryHighlights(summary);

  return (
    <article className="container-content py-10 md:py-14" data-testid="event-summary">
      <p className="type-meta font-semibold text-fg-tertiary">Event summary</p>
      <div className="mt-1 flex items-start justify-between gap-4">
        <h1 className="type-title-1 text-balance text-fg">{title}</h1>
        <PrintButton />
      </div>
      {when ? <p className="type-body mt-2 text-fg-secondary">{when}</p> : null}

      <section aria-label="Totals" className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile label="RSVPs" value={summary.rsvp_count} />
        <StatTile label="Checked in" value={summary.check_in_count} />
        <StatTile label="Clicks made" value={summary.connections_made} />
        <StatTile label="New pairs" value={summary.new_pair_count} />
        <StatTile label="Reconnections" value={summary.repeat_reconnect_count} hint="Knew each other before" />
        <StatTile label="Per check-in" value={summary.density.toFixed(2)} hint="Clicks ÷ check-ins" />
      </section>

      {highlights.length > 0 ? (
        <section aria-labelledby="summary-highlights" className="mt-10">
          <h2 id="summary-highlights" className="type-title-3 text-fg">
            Highlights
          </h2>
          <ul className="type-reading mt-3 flex list-disc flex-col gap-2 pl-5 text-fg">
            {highlights.map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className="type-meta mt-10 text-fg-tertiary">
        Totals only. Click never shares who attended or who connected with whom.
      </p>
    </article>
  );
}
