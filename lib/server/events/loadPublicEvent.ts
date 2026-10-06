import "server-only";

import { unstable_cache } from "next/cache";
import { loadPublicEventPayload, type PublicEventPayload } from "@/lib/events/publicEvent";
import { createAdminSupabaseClient } from "@/lib/server/admin/supabaseAdmin";

export const eventCacheTag = (beaconId: string) => `event:${beaconId}`;

class EventMissing extends Error {}

/**
 * The public event body, cached per event (spec §7.6.2) and shared by the page,
 * `generateMetadata` and the .ics route. Viewer-specific state never goes in here.
 * A miss (or a failed query, which the payload loader also reports as null) throws inside
 * the cache so it is never stored: a transient error must not pin a 404 for a minute.
 */
export async function loadPublicEvent(beaconId: string): Promise<PublicEventPayload | null> {
  try {
    return await unstable_cache(
      async () => {
        const event = await loadPublicEventPayload(createAdminSupabaseClient(), beaconId);
        if (!event) throw new EventMissing();
        return event;
      },
      ["public-event-v3", beaconId],
      { revalidate: 60, tags: [eventCacheTag(beaconId)] },
    )();
  } catch (e) {
    if (e instanceof EventMissing) return null;
    throw e;
  }
}
