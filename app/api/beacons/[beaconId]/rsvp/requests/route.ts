import { NextRequest, NextResponse } from "next/server";
import { requireEventManager } from "@/lib/events/requireEventManager";
import { upsertRsvpRequest } from "@/lib/events/eventRsvpPolicy";
import { parseBody } from "@/lib/api/parseBody";
import { eventRsvpRequestActionSchema } from "@/lib/api/schemas/beacons";

const UUID_RE = /^[0-9a-fA-F-]{36}$/;

/**
 * GET /api/beacons/{id}/rsvp/requests — organizer list of pending/waitlisted Click RSVPs.
 * POST { user_id, action: approve|deny } — approve writes beacon_attendees.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ beaconId: string }> },
) {
  try {
    const { beaconId } = await params;
    if (!UUID_RE.test(beaconId)) {
      return NextResponse.json({ error: "Invalid beacon id" }, { status: 400 });
    }
    const gate = await requireEventManager(request, beaconId);
    if (!gate.ok) return gate.response;

    const { data, error } = await gate.admin
      .from("event_rsvp_requests")
      .select("user_id, status, created_at, updated_at")
      .eq("beacon_id", beaconId)
      .in("status", ["pending", "waitlisted"])
      .order("created_at", { ascending: true });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ requests: Array.isArray(data) ? data : [] });
  } catch (e) {
    console.error("GET rsvp requests:", e);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ beaconId: string }> },
) {
  try {
    const { beaconId } = await params;
    if (!UUID_RE.test(beaconId)) {
      return NextResponse.json({ error: "Invalid beacon id" }, { status: 400 });
    }
    const gate = await requireEventManager(request, beaconId);
    if (!gate.ok) return gate.response;

    const parsed = await parseBody(request, eventRsvpRequestActionSchema);
    if (!parsed.ok) return parsed.response;
    const userId = parsed.data.user_id;
    const action = parsed.data.action === "deny" ? "deny" : "approve";
    if (action === "deny") {
      await upsertRsvpRequest(gate.admin, beaconId, userId, "denied");
      return NextResponse.json({ ok: true, status: "denied" });
    }

    const { error: insertError } = await gate.admin.from("beacon_attendees").upsert(
      {
        beacon_id: beaconId,
        user_id: userId,
        source: "organizer_approval",
        platform: "web",
        rsvpd_at: new Date().toISOString(),
      },
      { onConflict: "beacon_id,user_id" },
    );
    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 400 });
    }
    await upsertRsvpRequest(gate.admin, beaconId, userId, "approved");
    return NextResponse.json({ ok: true, status: "approved" });
  } catch (e) {
    console.error("POST rsvp requests:", e);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
