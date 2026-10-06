import { NextRequest, NextResponse } from "next/server";
import { requireEventManager } from "@/lib/events/requireEventManager";
import { countEventRsvps } from "@/lib/events/publicEvent";
import { EVENT_BEACON_UUID_RE } from "@/lib/events/eventMetadata";
import { loadGuestRsvps } from "@/lib/events/eventManageData";

/**
 * GET /api/beacons/{id}/rsvp/guests — organizer guest list (contact hidden from Place viewers) + Click attendee count.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ beaconId: string }> },
) {
  try {
    const { beaconId } = await params;
    if (!EVENT_BEACON_UUID_RE.test(beaconId)) {
      return NextResponse.json({ error: "Invalid beacon id" }, { status: 400 });
    }

    const gate = await requireEventManager(request, beaconId, { allowViewers: true });
    if (!gate.ok) return gate.response;
    const { admin } = gate;
    // Place viewers see who's coming but not how to reach them.
    const showContact = gate.access === "manage";

    const guests = await loadGuestRsvps(admin, beaconId, { showContact });
    const rsvp_count = await countEventRsvps(admin, beaconId);
    return NextResponse.json({
      beacon_id: beaconId,
      guests,
      click_plus_guest_rsvp_count: rsvp_count,
    });
  } catch (e) {
    console.error("GET /api/beacons/[beaconId]/rsvp/guests:", e);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
