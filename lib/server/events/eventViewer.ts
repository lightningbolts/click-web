import "server-only";

import { userMayManageBeacon } from "@/lib/events/beaconManageAuth";
import { eventRsvpKey, mutualAttendeesKey } from "@/lib/events/eventRsvpKey";
import { loadMutualConnectionAttendees } from "@/lib/events/eventRecap";
import type { PublicEventPayload } from "@/lib/events/publicEvent";
import { loadViewerEventRsvp, type ViewerEventRsvpSnapshot } from "@/lib/events/viewerEventGoing";
import { createAdminSupabaseClient } from "@/lib/server/admin/supabaseAdmin";
import { activeCheckIn } from "@/lib/server/eventPass";
import { loadEventRsvpPayload } from "@/lib/server/events/eventRsvpPayload";
import { getServerUser } from "@/lib/server/getServerUser";
import { countMyLiveTickets } from "@/lib/server/ticketing/offerings";

export type EventViewer = {
  userId: string | null;
  rsvp: ViewerEventRsvpSnapshot;
  /** Creator, or a manager of the hosting Place: sees the host bar. */
  canManage: boolean;
  /** Checked in at the door (a host scanned their Click Pass, or on-site check-in). */
  checkedIn: boolean;
  /** Live tickets held, on ticketed events. */
  myTicketCount: number;
  /**
   * The signed-in reads the page's client parts share through SWR (who's going and your RSVP,
   * your Clicks there), keyed as they fetch them, so they render with the page. A read that
   * fails is left out, and that part fetches it in the browser as before.
   */
  fallback: Record<string, unknown>;
};

/**
 * Everything on the event page that depends on who is looking (spec §7.6.2), read in one pass
 * with the page, so the host bar, RSVP, going line, people and chat are there at first paint
 * instead of arriving one by one.
 */
export async function loadEventViewer(event: PublicEventPayload): Promise<EventViewer> {
  const user = await getServerUser();
  if (!user) return { userId: null, rsvp: { kind: "guest" }, canManage: false, checkedIn: false, myTicketCount: 0, fallback: {} };
  const beaconId = event.beacon_id;
  const admin = createAdminSupabaseClient();
  const canManage = userMayManageBeacon(admin, user.id, { creator_id: event.creator_id ?? "", venue_id: event.venue_id }).catch(
    () => user.id === event.creator_id,
  );
  const [rsvp, mayManage, checkedInAt, myTicketCount, payload, mutual] = await Promise.all([
    loadViewerEventRsvp(beaconId, user.id),
    canManage,
    activeCheckIn(admin, beaconId, user.id).catch(() => null),
    event.ticketing ? countMyLiveTickets(admin, beaconId, user.id).catch(() => 0) : 0,
    canManage
      .then((manages) =>
        loadEventRsvpPayload(admin, beaconId, user.id, { mayManage: manages, guestListVisibility: event.listing.guest_list_visibility }),
      )
      .catch(() => null),
    loadMutualConnectionAttendees(admin, beaconId, user.id).catch(() => null),
  ]);
  return {
    userId: user.id,
    rsvp,
    canManage: mayManage,
    checkedIn: checkedInAt != null,
    myTicketCount,
    fallback: {
      ...(payload ? { [eventRsvpKey(beaconId)]: payload } : {}),
      ...(mutual ? { [mutualAttendeesKey(beaconId)]: mutual } : {}),
    },
  };
}
