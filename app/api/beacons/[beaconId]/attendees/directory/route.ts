import { NextRequest, NextResponse } from "next/server";
import { getSupabaseFromRouteRequest } from "@/lib/server/supabaseRouteAuth";
import { createAdminSupabaseClient } from "@/lib/server/admin/supabaseAdmin";
import { loadEventBeaconOrResponse } from "@/lib/server/eventEngagement";
import { enrichAttendeeDirectory } from "@/lib/events/attendeeDirectory";

const UUID_RE = /^[0-9a-fA-F-]{36}$/;

/**
 * GET — enriched attendee directory for an event beacon.
 * Requires authentication. RSVP and check-in status affect engagement CTAs only;
 * all signed-in viewers can plan around the enriched event directory.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ beaconId: string }> },
) {
  try {
    const { beaconId } = await params;
    if (!UUID_RE.test(beaconId)) {
      return NextResponse.json({ error: "Invalid beacon id" }, { status: 400 });
    }

    const { user, authError } = await getSupabaseFromRouteRequest(request);
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminSupabaseClient();
    const loaded = await loadEventBeaconOrResponse(admin, beaconId, { allowExpired: true });
    if ("response" in loaded) return loaded.response;

    let enriched;
    try {
      enriched = await enrichAttendeeDirectory(admin, beaconId, user.id);
    } catch (e) {
      console.error("GET attendees/directory enrich:", e);
      return NextResponse.json({ error: "Failed to load directory" }, { status: 500 });
    }

    return NextResponse.json({
      beacon_id: beaconId,
      attendees: enriched.attendees,
      current_user_signed_up: enriched.current_user_signed_up,
      current_user_checked_in: enriched.current_user_checked_in,
      mutuals_section_unlocked: enriched.mutuals_section_unlocked,
    });
  } catch (e) {
    console.error("GET /api/beacons/[beaconId]/attendees/directory:", e);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
