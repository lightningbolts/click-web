import { revalidateTag } from "next/cache";
import { PUBLIC_EVENTS_TAG, placeEventsTag } from "@/lib/events/directory";

/**
 * Drops the cached `/events` lists, the event's own page when `beaconId` is given, and the
 * hosting Place's event list when `venueId` is given, after an event is created, edited or
 * deleted. Never throws.
 */
export function revalidatePublicEvents(beaconId?: string | null, venueId?: string | null): void {
  try {
    revalidateTag(PUBLIC_EVENTS_TAG, { expire: 0 });
    if (beaconId) revalidateTag(`event:${beaconId}`, { expire: 0 });
    if (venueId) revalidateTag(placeEventsTag(venueId), { expire: 0 });
  } catch {
    // Outside a request (tests, scripts) there is no cache to drop.
  }
}
