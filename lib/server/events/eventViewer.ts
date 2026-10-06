import "server-only";

import { cache } from "react";
import { userMayManageBeacon } from "@/lib/events/beaconManageAuth";
import { loadViewerEventRsvp, type ViewerEventRsvpSnapshot } from "@/lib/events/viewerEventGoing";
import { createAdminSupabaseClient } from "@/lib/server/admin/supabaseAdmin";
import { getServerUser } from "@/lib/server/getServerUser";

export type EventViewer = {
  userId: string | null;
  rsvp: ViewerEventRsvpSnapshot;
  /** Creator, or a manager of the hosting Place: sees the host bar. */
  canManage: boolean;
};

/**
 * Everything on the event page that depends on who is looking (spec §7.6.2), loaded once
 * per request (React `cache`) and streamed in Suspense islands around the cached body.
 */
export const loadEventViewer = cache(
  async (beaconId: string, creatorId: string | null, venueId: string | null): Promise<EventViewer> => {
    const user = await getServerUser();
    if (!user) return { userId: null, rsvp: { kind: "guest" }, canManage: false };
    const [rsvp, canManage] = await Promise.all([
      loadViewerEventRsvp(beaconId, user.id),
      userMayManageBeacon(createAdminSupabaseClient(), user.id, { creator_id: creatorId ?? "", venue_id: venueId }).catch(
        () => user.id === creatorId,
      ),
    ]);
    return { userId: user.id, rsvp, canManage };
  },
);
