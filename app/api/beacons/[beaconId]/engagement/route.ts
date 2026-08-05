import { NextRequest, NextResponse } from "next/server";
import { getSupabaseFromRouteRequest } from "@/lib/server/supabaseRouteAuth";
import { createAdminSupabaseClient } from "@/lib/server/admin/supabaseAdmin";
import { loadEventBeaconOrResponse } from "@/lib/server/eventEngagement";

/**
 * GET /api/beacons/{id}/engagement — bookmark + check-in hydrate bundle (RSVP stays on /rsvp).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ beaconId: string }> },
) {
  try {
    const { beaconId } = await params;
    const { user, authError } = await getSupabaseFromRouteRequest(request);
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminSupabaseClient();
    const loaded = await loadEventBeaconOrResponse(admin, beaconId, { allowExpired: true });
    if ("response" in loaded) return loaded.response;

    const [{ data: bookmark }, { data: checkIn }, countRes] = await Promise.all([
      admin
        .from("event_bookmarks")
        .select("beacon_id")
        .eq("beacon_id", beaconId)
        .eq("user_id", user.id)
        .maybeSingle(),
      admin
        .from("event_check_ins")
        .select("checked_in_at, checked_out_at")
        .eq("beacon_id", beaconId)
        .eq("user_id", user.id)
        .maybeSingle(),
      admin
        .from("event_check_ins")
        .select("user_id", { count: "exact", head: true })
        .eq("beacon_id", beaconId)
        .is("checked_out_at", null),
    ]);

    const checkedIn =
      checkIn != null && (checkIn.checked_out_at == null || checkIn.checked_out_at === undefined);

    return NextResponse.json({
      beacon_id: beaconId,
      bookmarked: bookmark != null,
      checked_in: checkedIn,
      checked_in_at:
        checkedIn && typeof checkIn?.checked_in_at === "string" ? checkIn.checked_in_at : null,
      check_in_count: typeof countRes.count === "number" ? countRes.count : 0,
    });
  } catch (e) {
    console.error("GET /api/beacons/[beaconId]/engagement:", e);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
