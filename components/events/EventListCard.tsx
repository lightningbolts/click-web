import Link from "next/link";
import { CalendarDays, MapPin, Users, User } from "lucide-react";
import { FcCard } from "@/components/fc";
import { CardVisualHero } from "@/components/ui/CardVisualSurface";
import { formatEventWhen } from "@/lib/events/formatEventWhen";
import { eventDisplayTitle } from "@/lib/events/eventMetadata";
import { eventSharePath } from "@/lib/events/eventUrls";

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
};

function dateRail(iso: string | null): { month: string; day: string } | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  const date = new Date(ms);
  return {
    month: date.toLocaleString(undefined, { month: "short" }).toUpperCase(),
    day: String(date.getDate()),
  };
}

export function EventListCard({ event }: { event: EventListItem }) {
  const title = eventDisplayTitle(event.title, event.location_name, event.description);
  const when = formatEventWhen(event.event_start_at, event.event_end_at);
  const rail = dateRail(event.event_start_at);
  const description = event.description?.trim() || null;

  return (
    <Link href={eventSharePath(event.beacon_id)} className="block" data-testid="event-list-card">
      <FcCard className="overflow-hidden transition-colors hover:border-secondary">
        <div className="flex gap-3 p-3 sm:gap-4 sm:p-4">
          {rail ? (
            <div className="flex h-[4.5rem] w-14 shrink-0 flex-col items-center justify-center rounded-[12px] border border-border-hard bg-surface-container-low sm:h-20 sm:w-16">
              <span className="text-[10px] font-bold tracking-wide text-secondary">{rail.month}</span>
              <span className="text-2xl font-bold leading-none text-on-surface">{rail.day}</span>
            </div>
          ) : (
            <div className="flex h-[4.5rem] w-14 shrink-0 items-center justify-center rounded-[12px] border border-border-hard bg-surface-container-low sm:h-20 sm:w-16">
              <CalendarDays className="h-5 w-5 text-secondary" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h3 className="line-clamp-2 text-base font-bold leading-tight text-on-surface sm:text-lg">
              {title}
            </h3>
            {description ? (
              <p className="mt-1 line-clamp-2 text-sm text-on-surface-variant">{description}</p>
            ) : null}
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-on-surface-variant">
              <span className="inline-flex min-w-0 items-start gap-1.5">
                <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-secondary" />
                <span>{when ?? "Time to be announced"}</span>
              </span>
              <span className="inline-flex min-w-0 items-start gap-1.5">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                <span className="line-clamp-1">
                  {event.location_name?.trim() || "Location shared on the event page"}
                </span>
              </span>
              {event.host_name?.trim() ? (
                <span className="inline-flex min-w-0 items-center gap-1.5">
                  <User className="h-4 w-4 shrink-0" />
                  <span className="line-clamp-1">{event.host_name.trim()}</span>
                </span>
              ) : null}
              {typeof event.rsvp_count === "number" && event.rsvp_enabled !== false ? (
                <span className="inline-flex items-center gap-1.5 font-semibold text-secondary">
                  <Users className="h-4 w-4" />
                  {event.rsvp_count} going
                </span>
              ) : null}
            </div>
          </div>
          <CardVisualHero
            id={event.beacon_id}
            imageUrl={event.image_url}
            chipLabel={null}
            className="hidden h-20 w-20 shrink-0 rounded-[12px] sm:block"
          />
        </div>
      </FcCard>
    </Link>
  );
}
