import { revalidateTag } from "next/cache";
import { PUBLIC_EVENTS_TAG } from "@/lib/events/directory";

/**
 * Drops the cached `/events` lists, and the event's own page when `beaconId` is given,
 * after an event is created, edited or deleted. Never throws.
 */
export function revalidatePublicEvents(beaconId?: string): void {
  try {
    revalidateTag(PUBLIC_EVENTS_TAG, { expire: 0 });
    if (beaconId) revalidateTag(`event:${beaconId}`, { expire: 0 });
  } catch {
    // Outside a request (tests, scripts) there is no cache to drop.
  }
}
