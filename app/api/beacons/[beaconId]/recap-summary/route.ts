import { NextRequest, NextResponse } from "next/server";
import { requireEventManager } from "@/lib/events/requireEventManager";
import { loadRecapSummary } from "@/lib/events/eventRecap";

/**
 * GET /api/beacons/{id}/recap-summary — organizer only.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ beaconId: string }> },
) {
  try {
    const { beaconId } = await params;
    const auth = await requireEventManager(request, beaconId);
    if (!auth.ok) return auth.response;
    const summary = await loadRecapSummary(auth.admin, beaconId);
    return NextResponse.json(summary);
  } catch (e) {
    console.error("GET /api/beacons/[beaconId]/recap-summary:", e);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
