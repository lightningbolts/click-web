import Link from "next/link";
import { MapPin, User } from "lucide-react";
import { FcCard } from "@/components/fc";
import { CardVisualHero } from "@/components/ui/CardVisualSurface";
import { formatEventWhen } from "@/lib/events/formatEventWhen";
import {
  eventDisplayTitle,
  eventIsPast,
  eventSubtitle,
  eventWhereLabel,
} from "@/lib/events/eventMetadata";
import { eventSharePath } from "@/lib/events/eventUrls";
import EventGoingAvatars, { type EventGoingPerson } from "@/components/events/EventGoingAvatars";
import { cn } from "@/lib/cn";

export type EventListItem = {
  beacon_id: string;
  title: string | null;
  description?: string | null;
  image_url: string | null;
  host_name?: string | null;
  event_start_at: string | null;
  event_end_at: string | null;
  location_name: string | null;
  rsvp_count?: number;
  rsvp_enabled?: boolean;
  cover_theme_id?: string | null;
  visual_seed?: string | null;
  attendees?: EventGoingPerson[];
  timezone?: string | null;
};

export function EventListCard({
  event,
  featured = false,
  past,
  dense = false,
}: {
  event: EventListItem;
  featured?: boolean;
  past?: boolean;
  dense?: boolean;
}) {
  const title = eventDisplayTitle(event.title, event.location_name, event.description);
  const subtitle = eventSubtitle(title, event.description);
  const when = formatEventWhen(event.event_start_at, event.event_end_at, event.timezone);
  const where = eventWhereLabel(event.location_name);
  const seed = event.visual_seed || event.cover_theme_id || event.beacon_id;
  const isPast = past ?? eventIsPast(event);

  return (
    <Link href={eventSharePath(event.beacon_id)} className="block" data-testid="event-list-card">
      <FcCard
        className={cn(
          "overflow-hidden transition-colors hover:border-primary",
          featured ? "md:flex" : "flex min-h-28",
        )}
      >
        <CardVisualHero
          id={event.beacon_id}
          visualSeed={seed}
          imageUrl={event.image_url}
          chipLabel={featured ? "Featured" : null}
          className={
            featured
              ? "h-48 w-full shrink-0 md:h-auto md:min-h-[16rem] md:w-[42%]"
              : "w-28 shrink-0 self-stretch sm:w-32"
          }
        />
        <div className={cn("min-w-0 p-4", featured && "flex flex-1 flex-col justify-center md:p-6")}>
          <h3
            className={cn(
              "font-bold leading-tight text-on-surface",
              featured ? "font-display text-2xl md:text-3xl" : "text-base sm:text-lg",
            )}
          >
            {title}
          </h3>
          {when ? (
            <p className="mt-1 text-sm text-on-surface-variant">{when}</p>
          ) : (
            <p className="mt-1 text-xs text-on-surface-variant">Time TBD</p>
          )}
          {subtitle ? (
            <p className="mt-1 line-clamp-2 text-sm text-on-surface-variant">{subtitle}</p>
          ) : null}
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-on-surface-variant">
            {where ? (
              <span className="inline-flex min-w-0 items-center gap-1.5">
                <MapPin className="h-4 w-4 shrink-0 text-on-surface-variant" />
                <span className="line-clamp-1">{where}</span>
              </span>
            ) : null}
            {event.host_name?.trim() ? (
              <span className="inline-flex min-w-0 items-center gap-1.5">
                <User className="h-4 w-4 shrink-0" />
                <span className="line-clamp-1">{event.host_name.trim()}</span>
              </span>
            ) : null}
            {typeof event.rsvp_count === "number" && event.rsvp_enabled !== false ? (
              <EventGoingAvatars
                people={event.attendees ?? []}
                count={event.rsvp_count}
                past={isPast}
                dense={dense}
              />
            ) : null}
          </div>
        </div>
      </FcCard>
    </Link>
  );
}
