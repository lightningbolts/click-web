import Link from "next/link";
import { CalendarDays, MapPin, Users } from "lucide-react";
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
  event_start_at: string | null;
  event_end_at: string | null;
  location_name: string | null;
  rsvp_count?: number;
};

export function EventListCard({ event }: { event: EventListItem }) {
  const title = eventDisplayTitle(event.title, event.location_name, event.description);
  const when = formatEventWhen(event.event_start_at, event.event_end_at);
  return (
    <Link href={eventSharePath(event.beacon_id)} className="block h-full">
      <FcCard className="h-full overflow-hidden transition-colors hover:border-secondary">
        <CardVisualHero id={event.beacon_id} imageUrl={event.image_url} chipLabel="Event" className="h-44">
          <div className="flex h-full flex-col justify-end bg-gradient-to-t from-black/70 to-transparent p-4">
            <h3 className="line-clamp-2 text-lg font-bold leading-tight text-white">{title}</h3>
          </div>
        </CardVisualHero>
        <div className="space-y-2 p-4">
          <p className="flex items-start gap-2 text-sm text-on-surface">
            <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-secondary" />
            <span>{when ?? "Time to be announced"}</span>
          </p>
          <p className="flex items-start gap-2 text-sm text-on-surface-variant">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="line-clamp-2">{event.location_name?.trim() || "Location shared on the event page"}</span>
          </p>
          {typeof event.rsvp_count === "number" ? (
            <p className="flex items-center gap-2 text-xs font-semibold text-secondary">
              <Users className="h-3.5 w-3.5" />
              {event.rsvp_count} going
            </p>
          ) : null}
        </div>
      </FcCard>
    </Link>
  );
}
