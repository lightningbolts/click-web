import { NextRequest, NextResponse } from "next/server";
import { runAfterResponse } from "@/lib/server/afterResponse";
import { emitProductEvent } from "@/lib/server/telemetry/productEvents";
import { getSupabaseFromRouteRequest } from "@/lib/server/supabaseRouteAuth";
import { createAdminSupabaseClient } from "@/lib/server/admin/supabaseAdmin";
import {
  haversineMeters,
  insertEngagementEvent,
  loadEventBeaconOrResponse,
  minutesBeforeStart,
  parseEngagementTelemetryBody,
  resolveBeaconCoordinates,
} from "@/lib/server/eventEngagement";
import { parseBody } from "@/lib/api/parseBody";
import { engagementTelemetryBodySchema } from "@/lib/api/schemas/beacons";
import { maybeCreateSharedEventNudges } from "@/lib/events/sharedEventNudges";
import { cronPushBearer, pushFunctionUrl } from "@/lib/server/cronAuth";
import {
  decideMemberRsvp,
  listingOptionsFromBeacon,
  upsertRsvpRequest,
} from "@/lib/events/eventRsvpPolicy";
import { rsvpEnabledFromMetadata } from "@/lib/events/eventMetadata";
import { userMayManageBeacon } from "@/lib/events/beaconManageAuth";
import { recordRsvpActivity } from "@/lib/server/activity";
import { displayNameFromUser } from "@/lib/events/attendeeDirectory";
import { loadAttendeeProfiles, loadEventRsvpPayload } from "@/lib/server/events/eventRsvpPayload";

const UUID_RE = /^[0-9a-fA-F-]{36}$/;

/**
 * GET — list RSVP attendees for an event beacon (avatars + display names).
 * POST — current user RSVPs to the beacon.
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

    const { user, authError } = await getSupabaseFromRouteRequest(request);
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminSupabaseClient();
    // Past / expired events still expose who RSVPed (read-only).
    const loaded = await loadEventBeaconOrResponse(admin, beaconId, { allowExpired: true });
    if ("response" in loaded) return loaded.response;

    const listing = listingOptionsFromBeacon(loaded.beacon);
    const mayManage = await userMayManageBeacon(admin, user.id, {
      creator_id: loaded.beacon.creator_id ?? "",
      venue_id: loaded.beacon.venue_id,
    });
    return NextResponse.json(
      await loadEventRsvpPayload(admin, beaconId, user.id, { mayManage, guestListVisibility: listing.guest_list_visibility }),
    );
  } catch (e) {
    console.error("GET /api/beacons/[beaconId]/rsvp:", e);
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

    const { user, authError } = await getSupabaseFromRouteRequest(request);
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsed = await parseBody(request, engagementTelemetryBodySchema);
    if (!parsed.ok) return parsed.response;
    const body = parsed.data;
    const telemetry = parseEngagementTelemetryBody(body);

    const admin = createAdminSupabaseClient();
    const loaded = await loadEventBeaconOrResponse(admin, beaconId);
    if ("response" in loaded) return loaded.response;
    const { beacon } = loaded;
    if (!rsvpEnabledFromMetadata(beacon.metadata)) {
      return NextResponse.json({ error: "RSVP is closed for this event" }, { status: 403 });
    }
    const options = listingOptionsFromBeacon(beacon);

    const { data: existingGoing } = await admin
      .from("beacon_attendees")
      .select("user_id")
      .eq("beacon_id", beaconId)
      .eq("user_id", user.id)
      .maybeSingle();

    const decision = await decideMemberRsvp({
      admin,
      beaconId,
      userId: user.id,
      options,
      alreadyGoing: existingGoing != null,
    });
    if (decision.kind === "deny") {
      return NextResponse.json({ error: decision.error, code: decision.kind }, { status: decision.status });
    }
    if (decision.kind === "pending" || decision.kind === "waitlisted") {
      try {
        await upsertRsvpRequest(admin, beaconId, user.id, decision.kind);
      } catch (err) {
        console.error("POST rsvp request:", err);
        return NextResponse.json({ error: "Could not save request" }, { status: 400 });
      }
      if (decision.kind === "pending" && beacon.creator_id) {
        const hostId = beacon.creator_id;
        runAfterResponse("rsvp activity", () =>
          recordRsvpActivity(admin, { beaconId, hostId, actorId: user.id, metadata: beacon.metadata, requested: true }),
        );
      }
      return NextResponse.json({
        ok: true,
        request_status: decision.kind,
        message:
          decision.kind === "pending"
            ? "Approval required — request to join"
            : "Event full — join waitlist",
      });
    }

    let distanceMeters: number | null = null;
    if (telemetry.latitude != null && telemetry.longitude != null) {
      const coords = await resolveBeaconCoordinates(admin, beaconId, {
        lat: beacon.lat,
        lng: beacon.lng,
      });
      if (coords.lat != null && coords.lng != null) {
        distanceMeters = haversineMeters(
          telemetry.latitude,
          telemetry.longitude,
          coords.lat,
          coords.lng,
        );
      }
    }

    const mins = minutesBeforeStart(beacon.metadata);

    const { error: insertError } = await admin.from("beacon_attendees").upsert(
      {
        beacon_id: beaconId,
        user_id: user.id,
        latitude: telemetry.latitude,
        longitude: telemetry.longitude,
        accuracy_meters: telemetry.accuracy_meters,
        source: telemetry.source,
        platform: telemetry.platform,
        app_version: telemetry.app_version,
        client_occurred_at: telemetry.client_occurred_at,
        minutes_before_start: mins,
        distance_meters: distanceMeters,
        rsvpd_at: new Date().toISOString(),
      },
      { onConflict: "beacon_id,user_id" },
    );

    if (insertError) {
      console.error("POST /api/beacons/[beaconId]/rsvp:", insertError.message);
      return NextResponse.json({ error: insertError.message }, { status: 400 });
    }

    await insertEngagementEvent(admin, {
      beacon_id: beaconId,
      user_id: user.id,
      venue_id: beacon.venue_id,
      event_type: "rsvp_set",
      latitude: telemetry.latitude,
      longitude: telemetry.longitude,
      accuracy_meters: telemetry.accuracy_meters,
      distance_meters: distanceMeters,
      minutes_before_start: mins,
      client_occurred_at: telemetry.client_occurred_at,
      source: telemetry.source,
      platform: telemetry.platform,
      app_version: telemetry.app_version,
    });

    const profile = (await loadAttendeeProfiles(admin, [user.id])).get(user.id) ?? null;
    runAfterResponse("product events", () => emitProductEvent(admin, user.id, "beacon_joined", { type: "event" }));
    if (existingGoing == null && beacon.creator_id) {
      const hostId = beacon.creator_id;
      runAfterResponse("rsvp activity", () =>
        recordRsvpActivity(admin, { beaconId, hostId, actorId: user.id, metadata: beacon.metadata, requested: false }),
      );
    }

    void maybeCreateSharedEventNudges(admin, user.id, beaconId, { pushUrl: pushFunctionUrl(), authBearer: cronPushBearer() }).catch((err) => console.warn('shared-event nudge after rsvp:', err));

    return NextResponse.json({
      ok: true,
      attendee: {
        user_id: user.id,
        name: displayNameFromUser(profile),
        avatar_url: profile?.image ?? null,
      },
    });
  } catch (e) {
    console.error("POST /api/beacons/[beaconId]/rsvp:", e);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * DELETE — current user cancels their RSVP for the beacon (removes the junction row).
 * Idempotent: returns ok even if no row existed.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ beaconId: string }> },
) {
  try {
    const { beaconId } = await params;
    if (!UUID_RE.test(beaconId)) {
      return NextResponse.json({ error: "Invalid beacon id" }, { status: 400 });
    }

    const { user, authError } = await getSupabaseFromRouteRequest(request);
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminSupabaseClient();
    // allowExpired: cancel must work after the event window so users can leave a stuck RSVP.
    const loaded = await loadEventBeaconOrResponse(admin, beaconId, { allowExpired: true });
    const venueId = "beacon" in loaded ? loaded.beacon.venue_id : null;

    // Admin client: user-scoped DELETE was hitting RLS and surfacing as RSVP failures.
    const { error: deleteError } = await admin
      .from("beacon_attendees")
      .delete()
      .eq("beacon_id", beaconId)
      .eq("user_id", user.id);

    if (deleteError) {
      console.error("DELETE /api/beacons/[beaconId]/rsvp:", deleteError.message);
      return NextResponse.json({ error: deleteError.message }, { status: 400 });
    }

    await insertEngagementEvent(admin, {
      beacon_id: beaconId,
      user_id: user.id,
      venue_id: venueId,
      event_type: "rsvp_unset",
    });

    return NextResponse.json({ ok: true, user_id: user.id });
  } catch (e) {
    console.error("DELETE /api/beacons/[beaconId]/rsvp:", e);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
