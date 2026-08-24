import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { requireEventManager } from "@/lib/events/requireEventManager";
import { isRecord } from "@/lib/events/eventMetadata";

/**
 * POST /api/beacons/{id}/summary/publish — organizer publishes an aggregate-only snapshot.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ beaconId: string }> },
) {
  try {
    const { beaconId } = await params;
    const auth = await requireEventManager(request, beaconId);
    if (!auth.ok) return auth.response;

    const { data: row, error: readErr } = await auth.admin
      .from("map_beacons")
      .select("metadata")
      .eq("id", beaconId)
      .maybeSingle();
    if (readErr || !isRecord(row)) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }
    const meta = isRecord(row.metadata) ? { ...row.metadata } : {};
    const token = typeof meta.summary_token === "string" && meta.summary_token
      ? meta.summary_token
      : randomBytes(16).toString("hex");
    meta.summary_published = true;
    meta.summary_token = token;

    const { error } = await auth.admin
      .from("map_beacons")
      .update({ metadata: meta })
      .eq("id", beaconId);
    if (error) {
      console.error("publish summary:", error.message);
      return NextResponse.json({ error: "Failed to publish summary" }, { status: 500 });
    }
    return NextResponse.json({
      ok: true,
      summary_token: token,
      summary_path: `/e/${beaconId}/summary?token=${token}`,
    });
  } catch (e) {
    console.error("POST /api/beacons/[beaconId]/summary/publish:", e);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
