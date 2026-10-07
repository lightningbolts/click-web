import { eventWhereLabel } from "@/lib/events/eventMetadata";
import type { FlyerContent } from "@/lib/events/flyerCanvas";
import type { PublicEventPayload } from "@/lib/events/publicEvent";

export type FlyerEvent = FlyerContent & { seed: string; imageUrl: string | null; link: string };

/** What the Click Flyer says (spec 06 §8), in the event's own time zone: it's read days later, elsewhere. */
export function flyerEvent(event: PublicEventPayload, title: string, link: string, timeZone: string): FlyerEvent {
  const start = Date.parse(event.event_start_at ?? "");
  const at = (opts: Intl.DateTimeFormatOptions) =>
    Number.isFinite(start) ? new Intl.DateTimeFormat("en-US", { timeZone, ...opts }).format(start) : null;
  const weekday = at({ weekday: "short" });
  const time = at({ hour: "numeric", minute: "2-digit" });
  const host = event.place?.name ?? event.host_name?.trim();
  return {
    seed: event.visual_seed || event.beacon_id,
    imageUrl: event.image_url,
    link,
    title,
    host: host ? `Hosted by ${host}` : null,
    month: at({ month: "short" })?.toUpperCase() ?? null,
    day: at({ day: "numeric" }),
    when: weekday && time ? `${weekday} · ${time}` : null,
    place: eventWhereLabel(event.location_name) ?? event.address,
  };
}
