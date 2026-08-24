import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/server/admin/supabaseAdmin";
import { EVENT_BEACON_UUID_RE } from "@/lib/events/eventMetadata";
import { loadPublicEventPayload } from "@/lib/events/publicEvent";

/**
 * GET /api/beacons/{id}/public — unauthenticated share-landing subset (no attendees / private fields).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ beaconId: string }> },
) {
  try {
    const { beaconId } = await params;
    const id = beaconId?.trim();
    if (!id || !EVENT_BEACON_UUID_RE.test(id)) {
      return NextResponse.json({ error: "beaconId required" }, { status: 400 });
    }

    const admin = createAdminSupabaseClient();
    const payload = await loadPublicEventPayload(admin, id);
    if (payload == null) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }
    return NextResponse.json(payload);
  } catch (e) {
    console.error("GET /api/beacons/[beaconId]/public:", e);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
