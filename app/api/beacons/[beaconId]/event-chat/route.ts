import { NextRequest, NextResponse } from "next/server";
import { getSupabaseFromRouteRequest } from "@/lib/server/supabaseRouteAuth";
import { createAdminSupabaseClient } from "@/lib/server/admin/supabaseAdmin";
import { loadEventBeaconOrResponse } from "@/lib/server/eventEngagement";
import { ensureEventHubForBeacon } from "@/lib/server/eventHubRepair";
import { assertHubReadable } from "@/lib/server/hubGatekeeper";

/**
 * GET /api/beacons/{beaconId}/event-chat
 *
 * Authoritative event-chat resolver. Mobile supplies only the event id; the server resolves the
 * canonical linked hub and re-evaluates live event access before returning a navigation target.
 * Cached map-beacon hub ids are deliberately not trusted for authorization.
 *
 * Legacy active events created before automatic event-hub provisioning are repaired here rather
 * than left in a permanent EVENT_HUB_NOT_READY state. The canonical unique event_beacon_id link
 * remains the race arbiter when multiple clients resolve the same legacy event concurrently.
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
    // Let the hub gatekeeper own expiry semantics when a hub already exists. Missing historical
    // hubs are never created for an already-expired event.
    const loaded = await loadEventBeaconOrResponse(admin, beaconId, { allowExpired: true });
    if ("response" in loaded) return loaded.response;

    const beaconCreatorId =
      typeof loaded.beacon.creator_id === "string" && loaded.beacon.creator_id.trim()
        ? loaded.beacon.creator_id.trim()
        : null;

    const resolved = await ensureEventHubForBeacon(admin, {
      beaconId,
      creatorId: beaconCreatorId,
      lat: loaded.beacon.lat,
      lng: loaded.beacon.lng,
      metadata: loaded.beacon.metadata,
      expiresAt: loaded.beacon.expires_at,
    });

    if (resolved.hub == null) {
      if (resolved.reason === "expired") {
        return NextResponse.json(
          { error: "HUB_EXPIRED", message: "This event chat is no longer active." },
          { status: 410 },
        );
      }
      console.error("[event-chat] unable to ensure event hub:", {
        beaconId,
        reason: resolved.reason,
        detail: resolved.detail,
      });
      return NextResponse.json(
        {
          error: "EVENT_HUB_NOT_READY",
          message: "This event chat could not be prepared yet.",
        },
        { status: 409 },
      );
    }

    const hub = resolved.hub;
    const denied = await assertHubReadable(admin, hub.id, user.id);
    if (denied) return denied;

    // Keep compatibility membership aligned for downstream hub list/key flows. Authorization still
    // comes from assertHubReadable/auth_uid_in_hub, not this row.
    const { error: participantError } = await admin
      .from("hub_participants")
      .upsert(
        { hub_id: hub.id, user_id: user.id },
        { onConflict: "hub_id,user_id", ignoreDuplicates: true },
      );
    if (participantError) {
      console.warn("[event-chat] participant reconciliation:", participantError.message);
    }

    return NextResponse.json({
      event_id: beaconId,
      hub_id: hub.id,
      title: hub.name?.trim() || "Event",
      creator_id: hub.creator_id?.trim() || beaconCreatorId,
      repaired: resolved.repaired,
    });
  } catch (e) {
    console.error("GET /api/beacons/[beaconId]/event-chat:", e);
    return NextResponse.json(
      { error: "EVENT_CHAT_RESOLVE_FAILED", message: "Could not open this event chat." },
      { status: 500 },
    );
  }
}
