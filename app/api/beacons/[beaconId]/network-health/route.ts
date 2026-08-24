import { NextRequest, NextResponse } from "next/server";
import { requireEventManager } from "@/lib/events/requireEventManager";
import { loadRecapSummary } from "@/lib/events/eventRecap";

/**
 * GET /api/beacons/{id}/network-health — wraps recap summary for organizer dashboards.
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
    return NextResponse.json({
      ...summary,
      check_ins_vs_connections: {
        check_ins: summary.check_in_count,
        connections: summary.connections_made,
      },
    });
  } catch (e) {
    console.error("GET /api/beacons/[beaconId]/network-health:", e);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
