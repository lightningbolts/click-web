import Link from "next/link";
import { ArrowUpRight, ChevronRight, Eye } from "lucide-react";
import { Button } from "@/components/ds/Button";
import { StatusPill } from "@/components/ds/StatusPill";
import { LinkTabs } from "@/components/ds/Tabs";
import { EventShareButton } from "@/components/events/EventShareButton";
import type { EventAccess } from "@/lib/events/beaconManageAuth";
import { eventDisplayTitle } from "@/lib/events/eventMetadata";
import { eventManagePath, eventSharePath, eventShareUrl } from "@/lib/events/eventUrls";
import type { PublicEventPayload } from "@/lib/events/publicEvent";

export function manageTabs(beaconId: string, access: EventAccess) {
  const base = eventManagePath(beaconId);
  return [
    { href: base, label: "Overview" },
    { href: `${base}/guests`, label: "Guests" },
    ...(access === "manage" ? [{ href: `${base}/edit`, label: "Edit" }] : []),
    { href: `${base}/insights`, label: "Insights" },
    { href: `${base}/recap`, label: "Recap & summary" },
  ];
}

/** Breadcrumb, title, View / Share, and the URL tabs (spec §7.6.4). */
export function ManageHeader({
  event,
  place,
  access,
}: {
  event: PublicEventPayload;
  place: { id: string; name: string } | null;
  access: EventAccess;
}) {
  const title = eventDisplayTitle(event.title, event.location_name, event.description);
  const crumbs = place
    ? [
        { href: "/business/places", label: "Business" },
        { href: `/business/places/${place.id}`, label: place.name },
        { href: `/insights/events?venue_id=${place.id}`, label: "Events" },
      ]
    : [{ href: "/events", label: "Events" }];

  return (
    <header data-testid="event-manage-header">
      <nav aria-label="Breadcrumb">
        <ol className="type-meta flex min-w-0 flex-wrap items-center gap-1 text-fg-tertiary">
          {crumbs.map((c) => (
            <li key={c.href} className="flex items-center gap-1">
              <Link href={c.href} className="hover:text-fg-secondary hover:underline">
                {c.label}
              </Link>
              <ChevronRight size={12} strokeWidth={2.25} aria-hidden />
            </li>
          ))}
          <li aria-current="page" className="min-w-0 truncate text-fg-secondary">
            {title}
          </li>
        </ol>
      </nav>
      <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="type-title-2 truncate text-fg">{title}</h1>
          {access === "view" ? (
            <StatusPill variant="neutral" icon={Eye}>
              View only
            </StatusPill>
          ) : null}
        </div>
        <div className="flex shrink-0 gap-2">
          <Button href={eventSharePath(event.beacon_id)} size="sm" trailingIcon={ArrowUpRight}>
            View event
          </Button>
          <EventShareButton url={eventShareUrl(event.beacon_id)} title={title} variant="primary" />
        </div>
      </div>
      <LinkTabs label="Manage event" tabs={manageTabs(event.beacon_id, access)} className="mt-4" />
    </header>
  );
}
