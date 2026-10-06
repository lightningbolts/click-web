import { revalidateTag } from "next/cache";
import { PUBLIC_EVENTS_TAG } from "@/lib/events/directory";

/** Drops the cached `/events` lists after an event is created, edited or deleted. Never throws. */
export function revalidatePublicEvents(): void {
  try {
    revalidateTag(PUBLIC_EVENTS_TAG, { expire: 0 });
  } catch {
    // Outside a request (tests, scripts) there is no cache to drop.
  }
}
