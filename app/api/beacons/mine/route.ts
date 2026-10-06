import { NextRequest, NextResponse } from "next/server";
import { getSupabaseFromRouteRequest } from "@/lib/server/supabaseRouteAuth";
import { createAdminSupabaseClient } from "@/lib/server/admin/supabaseAdmin";
import { loadMineEvents } from "@/lib/server/events/mineEvents";

/**
 * GET /api/beacons/mine — events the caller created or RSVPed to (Click account).
 */
export async function GET(request: NextRequest) {
  try {
    const { user, authError } = await getSupabaseFromRouteRequest(request);
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const events = await loadMineEvents(createAdminSupabaseClient(), user.id);
    return NextResponse.json({ events });
  } catch (e) {
    console.error("GET /api/beacons/mine:", e);
    return NextResponse.json({ error: "Failed to load events" }, { status: 500 });
  }
}
