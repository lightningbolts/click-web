import { NextRequest, NextResponse } from "next/server";
import { getSupabaseFromRouteRequest } from "@/lib/server/supabaseRouteAuth";
import { createAdminSupabaseClient } from "@/lib/server/admin/supabaseAdmin";
import { loadBeaconManageRow, userMayManageBeacon } from "@/lib/events/beaconManageAuth";
import { countEventRsvps } from "@/lib/events/publicEvent";
import { EVENT_BEACON_UUID_RE, isRecord } from "@/lib/events/eventMetadata";

/**
 * GET /api/beacons/{id}/rsvp/guests — organizer-only guest list + Click attendee count.
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
    const beacon = await loadBeaconManageRow(admin, beaconId);
    if (beacon == null || beacon.beacon_type !== "event") {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }
    if (!(await userMayManageBeacon(admin, user.id, beacon))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data, error } = await admin
      .from("event_guest_rsvps")
      .select("id, name, contact, created_at")
      .eq("beacon_id", beaconId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("GET guest rsvps:", error.message);
      return NextResponse.json({ error: "Failed to load guests" }, { status: 500 });
    }

    const guests = (Array.isArray(data) ? data : [])
      .map((row) => {
        if (!isRecord(row)) return null;
        return {
          id: typeof row.id === "string" ? row.id : "",
          name: typeof row.name === "string" ? row.name : "Guest",
          contact: typeof row.contact === "string" ? row.contact : "",
          created_at: typeof row.created_at === "string" ? row.created_at : "",
        };
      })
      .filter((row): row is NonNullable<typeof row> => row != null && row.id.length > 0);

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
