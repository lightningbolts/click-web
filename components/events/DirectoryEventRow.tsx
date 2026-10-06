import { EventRow, type EventRowPill } from '@/components/ds/EventRow';
import { eventDisplayTitle } from '@/lib/events/eventMetadata';
import type { PublicEventListItem } from '@/lib/events/publicEvent';
import { formatEventWhen } from '@/lib/home/format';
import { eventHref } from '@/lib/shell/appNav';

const THREE_HOURS = 3 * 3_600_000;

function isLive(e: PublicEventListItem, nowMs: number): boolean {
  const start = Date.parse(e.event_start_at ?? '');
  if (!Number.isFinite(start) || start > nowMs) return false;
  const end = Date.parse(e.event_end_at ?? '');
  return (Number.isFinite(end) && end > start ? end : start + THREE_HOURS) > nowMs;
}

/**
 * One public event in a list (spec §7.6.1). Under a day heading the time is enough; in a
 * flat list (sorted by going or host) it carries the day too.
 */
export function DirectoryEventRow({
  event,
  timeZone,
  nowMs,
  timeOnly,
  featured,
}: {
  event: PublicEventListItem;
  timeZone: string;
  nowMs: number;
  timeOnly: boolean;
  featured?: boolean;
}) {
  const start = Date.parse(event.event_start_at ?? '');
  const timeLabel = !Number.isFinite(start)
    ? 'Date to be announced'
    : timeOnly
      ? new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' }).format(start)
      : formatEventWhen(event.event_start_at, timeZone, nowMs);
  const pills: EventRowPill[] = [];
  if (featured) pills.push({ label: 'Featured', variant: 'tinted' });
  const host = event.place
    ? { seed: event.place.id, name: event.place.name }
    : event.host_name
      ? { seed: event.host_name, name: event.host_name, src: event.host_avatar_url }
      : null;
  return (
    <EventRow
      href={eventHref(event.beacon_id)}
      id={event.visual_seed || event.beacon_id}
      title={eventDisplayTitle(event.title, event.location_name, event.description)}
      timeLabel={timeLabel}
      live={isLive(event, nowMs)}
      host={host}
      location={event.location_name}
      photoUrl={event.image_url}
      pills={pills}
      featured={featured}
      going={
        event.rsvp_count > 0
          ? {
              count: event.rsvp_count,
              people: event.attendees.slice(0, 3).map((a) => ({ seed: a.user_id, name: a.name, src: a.avatar_url })),
            }
          : null
      }
    />
  );
}
