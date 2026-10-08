import { BarChart3, FileText, ImagePlus, PencilLine, ScanLine, Upload, UserCheck } from "lucide-react";
import Link from "next/link";
import { ListGroup, ListRow } from "@/components/ds/ListGroup";
import { StatTile } from "@/components/ds/StatTile";
import { ManageShareCard } from "@/components/events/manage/ManageShareCard";
import type { EventAccess } from "@/lib/events/beaconManageAuth";
import type { ManageCounts } from "@/lib/events/eventManageData";
import { eventDisplayTitle } from "@/lib/events/eventMetadata";
import { eventManagePath, eventScanPath, eventShareUrl } from "@/lib/events/eventUrls";
import { flyerEvent } from "@/lib/events/flyerEvent";
import { formatEventWhen } from "@/lib/events/formatEventWhen";
import type { PublicEventPayload } from "@/lib/events/publicEvent";
import { formatAmount } from "@/lib/ticketing/money";
import type { TicketSalesSummary } from "@/lib/ticketing/types";

type Step = { href: string; icon: typeof Upload; title: string; subtitle: string };

/** What the host should do next, most urgent first. Read-only viewers get none. */
export function manageNextSteps(args: {
  beaconId: string;
  counts: ManageCounts;
  ended: boolean;
  hasCover: boolean;
  summaryPublished: boolean;
}): Step[] {
  const base = eventManagePath(args.beaconId);
  const steps: Step[] = [];
  const pending = args.counts.requests + args.counts.waitlist;
  if (pending > 0) {
    steps.push({
      href: `${base}/guests`,
      icon: UserCheck,
      title: `Review ${pending} ${pending === 1 ? "request" : "requests"}`,
      subtitle: "Approve or decline people waiting to join.",
    });
  }
  if (args.ended) {
    if (!args.summaryPublished) {
      steps.push({ href: `${base}/recap`, icon: FileText, title: "Publish a summary", subtitle: "Share aggregate numbers with a private link." });
    }
    steps.push({ href: `${base}/insights`, icon: BarChart3, title: "See how it went", subtitle: "Check-ins and connections made." });
  } else {
    steps.push({ href: eventScanPath(args.beaconId), icon: ScanLine, title: "Scan Click Passes", subtitle: "Check guests in at the door." });
    if (!args.hasCover) {
      steps.push({ href: `${base}/edit`, icon: ImagePlus, title: "Add a cover photo", subtitle: "Events with a photo get more RSVPs." });
    }
    steps.push({ href: `${base}/guests#guest-list`, icon: Upload, title: "Seed the room", subtitle: "Upload a guest list to invite people already on Click." });
    steps.push({ href: `${base}/edit`, icon: PencilLine, title: "Edit details", subtitle: "Time, place, capacity and approval." });
  }
  return steps;
}

export function ManageOverview({
  event,
  counts,
  access,
  ended,
  summaryPublished,
  sales = null,
}: {
  event: PublicEventPayload;
  counts: ManageCounts;
  access: EventAccess;
  ended: boolean;
  summaryPublished: boolean;
  /** Ticketed events: sales at a glance, linking to the Tickets tab. */
  sales?: TicketSalesSummary | null;
}) {
  const when = formatEventWhen(event.event_start_at, event.event_end_at, event.timezone);
  const steps =
    access === "manage"
      ? manageNextSteps({ beaconId: event.beacon_id, counts, ended, hasCover: Boolean(event.image_url), summaryPublished })
      : [];
  const capacity = event.listing.event_capacity;
  const url = eventShareUrl(event.beacon_id);
  const title = eventDisplayTitle(event.title, event.location_name, event.description);

  return (
    <div className="flex flex-col gap-8" data-testid="manage-overview">
      <section aria-label="At a glance">
        {when || event.location_name ? (
          <p className="type-body mb-3 text-fg-secondary">{[when, event.location_name].filter(Boolean).join(" · ")}</p>
        ) : null}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatTile
            label={ended ? "Went" : "Going"}
            value={counts.going}
            hint={capacity != null ? `of ${capacity} spots` : counts.guests > 0 ? `incl. ${counts.guests} without Click` : undefined}
          />
          <StatTile label="Requests" value={counts.requests} />
          <StatTile label="Waitlist" value={counts.waitlist} />
          <StatTile label="Checked in" value={counts.checkedIn} />
        </div>
      </section>

      {sales ? (
        <section aria-labelledby="overview-tickets-heading">
          <div className="mb-2 flex items-baseline justify-between px-4">
            <h3 id="overview-tickets-heading" className="type-meta font-semibold text-fg-secondary">
              Tickets
            </h3>
            <Link href={`${eventManagePath(event.beacon_id)}/tickets`} className="type-meta font-semibold text-accent hover:underline">
              See all
            </Link>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <StatTile label="Sold" value={`${sales.sold} / ${sales.capacity}`} />
            <StatTile label="Checked in" value={sales.checked_in} />
            <StatTile label="Gross" value={formatAmount(sales.gross_cents, sales.currency)} />
          </div>
        </section>
      ) : null}

      <div className="grid gap-8 min-[900px]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <ManageShareCard
          url={url}
          fileName={`click-event-${event.beacon_id.slice(0, 8)}`}
          flyer={access === "manage" && !ended ? flyerEvent(event, title, url, event.timezone ?? "UTC") : null}
        />
        {steps.length > 0 ? (
          <ListGroup header="Next steps">
            {steps.map((s) => (
              <ListRow key={s.title} href={s.href} icon={s.icon} title={s.title} subtitle={s.subtitle} strong />
            ))}
          </ListGroup>
        ) : null}
      </div>
    </div>
  );
}
