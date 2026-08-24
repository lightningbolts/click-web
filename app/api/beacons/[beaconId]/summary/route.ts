import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/server/admin/supabaseAdmin";
import { EVENT_BEACON_UUID_RE, isRecord } from "@/lib/events/eventMetadata";
import { loadRecapSummary } from "@/lib/events/eventRecap";
import {
  eventEndAtFromMetadata,
  eventStartAtFromMetadata,
  eventTitleFromMetadata,
} from "@/lib/events/eventMetadata";

/**
 * GET /api/beacons/{id}/summary?token= — public aggregate snapshot (no identities).
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
    const token = new URL(request.url).searchParams.get("token")?.trim() ?? "";
    if (!token) {
      return NextResponse.json({ error: "token required" }, { status: 400 });
    }

    const admin = createAdminSupabaseClient();
    const { data, error } = await admin
      .from("map_beacons")
      .select("id, beacon_type, metadata")
      .eq("id", beaconId)
      .maybeSingle();
    if (error || !isRecord(data) || data.beacon_type !== "event") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const meta = isRecord(data.metadata) ? data.metadata : {};
    if (meta.summary_published !== true || meta.summary_token !== token) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const summary = await loadRecapSummary(admin, beaconId);
    return NextResponse.json({
      ...summary,
      title: eventTitleFromMetadata(meta),
      event_start_at: eventStartAtFromMetadata(meta),
      event_end_at: eventEndAtFromMetadata(meta),
    });
  } catch (e) {
    console.error("GET /api/beacons/[beaconId]/summary:", e);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
