import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/server/admin/supabaseAdmin";
import { EVENT_BEACON_UUID_RE } from "@/lib/events/eventMetadata";
import { loadPublishedSummary } from "@/lib/server/events/loadPublishedSummary";

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

    const summary = await loadPublishedSummary(createAdminSupabaseClient(), beaconId, token);
    if (summary == null) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(summary);
  } catch (e) {
    console.error("GET /api/beacons/[beaconId]/summary:", e);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
