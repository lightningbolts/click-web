import { NextRequest, NextResponse } from "next/server";
import { getSupabaseFromRouteRequest } from "@/lib/server/supabaseRouteAuth";
import { createAdminSupabaseClient } from "@/lib/server/admin/supabaseAdmin";
import { loadEventBeaconOrResponse } from "@/lib/server/eventEngagement";
import { EVENT_BEACON_UUID_RE } from "@/lib/events/eventMetadata";
import { loadMutualConnectionAttendees } from "@/lib/events/eventRecap";

/**
 * GET /api/beacons/{id}/mutual-attendees — authenticated; connections already going.
 * Returns { count: 0 } when empty so the client can hide the module.
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

    const payload = await loadMutualConnectionAttendees(admin, beaconId, user.id);
    return NextResponse.json(payload);
  } catch (e) {
    console.error("GET /api/beacons/[beaconId]/mutual-attendees:", e);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
