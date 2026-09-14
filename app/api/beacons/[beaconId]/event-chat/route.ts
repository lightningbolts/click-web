import { NextRequest, NextResponse } from "next/server";
import { getSupabaseFromRouteRequest } from "@/lib/server/supabaseRouteAuth";
import { createAdminSupabaseClient } from "@/lib/server/admin/supabaseAdmin";
import { loadEventBeaconOrResponse } from "@/lib/server/eventEngagement";
import { findHubForEventBeacon } from "@/lib/server/eventHubLifecycle";
import { assertHubReadable } from "@/lib/server/hubGatekeeper";

/**
 * GET /api/beacons/{beaconId}/event-chat
 *
 * Authoritative event-chat resolver. Mobile supplies only the event id; the server resolves the
 * canonical linked hub and re-evaluates live event access before returning a navigation target.
 * Cached map-beacon hub ids are deliberately not trusted for authorization.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ beaconId: string }> },
) {
  try {
    const { beaconId } = await params;
    const { user, authError } = await getSupabaseFromRouteRequest(request);
    if (authError || !user) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const admin = createAdminSupabaseClient();
    // Let the hub gatekeeper own expiry semantics. An expired event can still be resolved to its
    // hub so callers receive the canonical HUB_EXPIRED terminal state instead of a generic event
    // lookup failure.
    const loaded = await loadEventBeaconOrResponse(admin, beaconId, { allowExpired: true });
    if ("response" in loaded) return loaded.response;

    const hub = await findHubForEventBeacon(admin, beaconId);
    if (hub == null) {
      return NextResponse.json(
        {
          error: "EVENT_HUB_NOT_READY",
          message: "This event chat is not ready yet.",
        },
        { status: 409 },
      );
    }

    const denied = await assertHubReadable(admin, hub.id, user.id);
    if (denied) return denied;

    const beaconCreatorId =
      typeof loaded.beacon.creator_id === "string" && loaded.beacon.creator_id.trim()
        ? loaded.beacon.creator_id.trim()
        : null;

    return NextResponse.json({
      event_id: beaconId,
      hub_id: hub.id,
      title: hub.name?.trim() || "Event",
      creator_id: hub.creator_id?.trim() || beaconCreatorId,
    });
  } catch (e) {
    console.error("GET /api/beacons/[beaconId]/event-chat:", e);
    return NextResponse.json(
      { error: "EVENT_CHAT_RESOLVE_FAILED", message: "Could not open this event chat." },
      { status: 500 },
    );
  }
}
