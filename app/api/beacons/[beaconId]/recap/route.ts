import { NextRequest, NextResponse } from "next/server";
import { getSupabaseFromRouteRequest } from "@/lib/server/supabaseRouteAuth";
import { createAdminSupabaseClient } from "@/lib/server/admin/supabaseAdmin";
import { loadEventBeaconOrResponse } from "@/lib/server/eventEngagement";
import { EVENT_BEACON_UUID_RE } from "@/lib/events/eventMetadata";
import { loadAttendeeRecap, userParticipatedInEvent } from "@/lib/events/eventRecap";

/**
 * GET /api/beacons/{id}/recap — authenticated participant (RSVP or check-in).
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

    const { user, authError } = await getSupabaseFromRouteRequest(request);
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminSupabaseClient();
    const loaded = await loadEventBeaconOrResponse(admin, beaconId, { allowExpired: true });
    if ("response" in loaded) return loaded.response;

    const participated = await userParticipatedInEvent(admin, beaconId, user.id);
    if (!participated) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const people = await loadAttendeeRecap(admin, beaconId, user.id);
    return NextResponse.json({ beacon_id: beaconId, people });
  } catch (e) {
    console.error("GET /api/beacons/[beaconId]/recap:", e);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
