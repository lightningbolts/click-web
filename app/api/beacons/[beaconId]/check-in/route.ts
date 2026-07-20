import { NextRequest, NextResponse } from "next/server";
import { getSupabaseFromRouteRequest } from "@/lib/server/supabaseRouteAuth";
import { createAdminSupabaseClient } from "@/lib/server/admin/supabaseAdmin";
import { assertEventCheckInGeofence } from "@/lib/server/eventCheckInGeofence";
import {
  insertEngagementEvent,
  isEventLiveForCheckIn,
  loadEventBeaconOrResponse,
  minutesAfterStart,
  parseEngagementTelemetryBody,
  resolveCheckInRadiusMeters,
} from "@/lib/server/eventEngagement";

/**
 * GET — current user check-in status + public check_in_count.
 * POST — check in (requires GPS + live window + geofence).
 * DELETE — check out / undo.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ beaconId: string }> },
) {
  try {
    const { beaconId } = await params;
    const { user, authError } = await getSupabaseFromRouteRequest(request);
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminSupabaseClient();
    const loaded = await loadEventBeaconOrResponse(admin, beaconId);
    if ("response" in loaded) return loaded.response;

    const { data: mine, error: mineErr } = await admin
      .from("event_check_ins")
      .select("checked_in_at, checked_out_at")
      .eq("beacon_id", beaconId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (mineErr) {
      console.error("GET check-in mine:", mineErr.message);
      return NextResponse.json({ error: "Failed to load check-in" }, { status: 500 });
    }

    const { count, error: countErr } = await admin
      .from("event_check_ins")
      .select("user_id", { count: "exact", head: true })
      .eq("beacon_id", beaconId)
      .is("checked_out_at", null);

    if (countErr) {
      console.error("GET check-in count:", countErr.message);
    }

    const checkedIn =
      mine != null && (mine.checked_out_at == null || mine.checked_out_at === undefined);

    return NextResponse.json({
      beacon_id: beaconId,
      checked_in: checkedIn,
      checked_in_at: checkedIn && typeof mine?.checked_in_at === "string" ? mine.checked_in_at : null,
      check_in_count: typeof count === "number" ? count : 0,
    });
  } catch (e) {
    console.error("GET /api/beacons/[beaconId]/check-in:", e);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ beaconId: string }> },
) {
  try {
    const { beaconId } = await params;
    const { user, authError } = await getSupabaseFromRouteRequest(request);
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: unknown = null;
    try {
      body = await request.json();
    } catch {
      body = null;
    }
    const telemetry = parseEngagementTelemetryBody(body);

    const admin = createAdminSupabaseClient();
    const loaded = await loadEventBeaconOrResponse(admin, beaconId);
    if ("response" in loaded) return loaded.response;
    const { beacon } = loaded;
    const { radiusMeters, venueScale } = resolveCheckInRadiusMeters(beacon.metadata);

    // Geofence ALWAYS runs first. Previously `not_live` (409) short-circuited before distance
    // checks, so the mobile client treated far-away taps as "checked in early".
    const geo = await assertEventCheckInGeofence(
      admin,
      beacon,
      telemetry.latitude,
      telemetry.longitude,
    );

    if (!geo.ok) {
      await insertEngagementEvent(admin, {
        beacon_id: beaconId,
        user_id: user.id,
        venue_id: beacon.venue_id,
        event_type: "check_in_rejected",
        reject_reason: geo.rejectReason,
        latitude: telemetry.latitude,
        longitude: telemetry.longitude,
        accuracy_meters: telemetry.accuracy_meters,
        distance_meters: geo.distanceMeters ?? null,
        radius_meters_applied: geo.radiusMeters ?? radiusMeters,
        venue_scale: geo.venueScale ?? venueScale,
        client_occurred_at: telemetry.client_occurred_at,
        source: telemetry.source,
        platform: telemetry.platform,
        app_version: telemetry.app_version,
      });
      return geo.response;
    }

    if (!isEventLiveForCheckIn(beacon.metadata)) {
      await insertEngagementEvent(admin, {
        beacon_id: beaconId,
        user_id: user.id,
        venue_id: beacon.venue_id,
        event_type: "check_in_rejected",
        reject_reason: "not_live",
        latitude: telemetry.latitude,
        longitude: telemetry.longitude,
        accuracy_meters: telemetry.accuracy_meters,
        distance_meters: geo.distanceMeters,
        client_occurred_at: telemetry.client_occurred_at,
        source: telemetry.source,
        platform: telemetry.platform,
        app_version: telemetry.app_version,
        radius_meters_applied: radiusMeters,
        venue_scale: venueScale,
      });
      return NextResponse.json(
        {
          error: "Event not live",
          message: "Check-in opens when the event starts",
          reject_reason: "not_live",
        },
        { status: 409 },
      );
    }

    const [{ data: rsvpRow }, { data: bookmarkRow }, { data: existing }] = await Promise.all([
      admin
        .from("beacon_attendees")
        .select("user_id")
        .eq("beacon_id", beaconId)
        .eq("user_id", user.id)
        .maybeSingle(),
      admin
        .from("event_bookmarks")
        .select("beacon_id")
        .eq("beacon_id", beaconId)
        .eq("user_id", user.id)
        .maybeSingle(),
      admin
        .from("event_check_ins")
        .select("check_in_count, checked_out_at")
        .eq("beacon_id", beaconId)
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);

    const hadRsvp = rsvpRow != null;
    const hadBookmark = bookmarkRow != null;
    const prevCount =
      existing != null && typeof existing.check_in_count === "number"
        ? existing.check_in_count
        : 0;
    const wasActive = existing != null && existing.checked_out_at == null;
    const nextCount = wasActive ? prevCount : prevCount + 1;
    const nowIso = new Date().toISOString();
    const minsAfter = minutesAfterStart(beacon.metadata);

    const { error: upsertErr } = await admin.from("event_check_ins").upsert(
      {
        user_id: user.id,
        beacon_id: beaconId,
        checked_in_at: nowIso,
        checked_out_at: null,
        check_in_count: Math.max(1, nextCount),
        latitude: geo.latitude,
        longitude: geo.longitude,
        accuracy_meters: telemetry.accuracy_meters,
        distance_meters: geo.distanceMeters,
        radius_meters_applied: geo.radiusMeters,
        venue_scale: geo.venueScale,
        had_rsvp: hadRsvp,
        had_bookmark: hadBookmark,
        client_occurred_at: telemetry.client_occurred_at,
        source: telemetry.source ?? "mobile",
        platform: telemetry.platform,
        app_version: telemetry.app_version,
        minutes_after_start: minsAfter,
      },
      { onConflict: "user_id,beacon_id" },
    );

    if (upsertErr) {
      console.error("POST check-in upsert:", upsertErr.message);
      return NextResponse.json({ error: upsertErr.message }, { status: 400 });
    }

    await insertEngagementEvent(admin, {
      beacon_id: beaconId,
      user_id: user.id,
      venue_id: beacon.venue_id,
      event_type: "check_in",
      latitude: geo.latitude,
      longitude: geo.longitude,
      accuracy_meters: telemetry.accuracy_meters,
      distance_meters: geo.distanceMeters,
      radius_meters_applied: geo.radiusMeters,
      venue_scale: geo.venueScale,
      minutes_after_start: minsAfter,
      had_rsvp: hadRsvp,
      had_bookmark: hadBookmark,
      client_occurred_at: telemetry.client_occurred_at,
      source: telemetry.source ?? "mobile",
      platform: telemetry.platform,
      app_version: telemetry.app_version,
    });

    const { count } = await admin
      .from("event_check_ins")
      .select("user_id", { count: "exact", head: true })
      .eq("beacon_id", beaconId)
      .is("checked_out_at", null);

    return NextResponse.json({
      ok: true,
      checked_in: true,
      checked_in_at: nowIso,
      check_in_count: typeof count === "number" ? count : 0,
    });
  } catch (e) {
    console.error("POST /api/beacons/[beaconId]/check-in:", e);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ beaconId: string }> },
) {
  try {
    const { beaconId } = await params;
    const { user, authError } = await getSupabaseFromRouteRequest(request);
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminSupabaseClient();
    const loaded = await loadEventBeaconOrResponse(admin, beaconId);
    if ("response" in loaded) return loaded.response;
    const { beacon } = loaded;

    const nowIso = new Date().toISOString();
    const { error } = await admin
      .from("event_check_ins")
      .update({ checked_out_at: nowIso })
      .eq("beacon_id", beaconId)
      .eq("user_id", user.id)
      .is("checked_out_at", null);

    if (error) {
      console.error("DELETE check-in:", error.message);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    await insertEngagementEvent(admin, {
      beacon_id: beaconId,
      user_id: user.id,
      venue_id: beacon.venue_id,
      event_type: "check_out",
    });

    return NextResponse.json({ ok: true, checked_in: false });
  } catch (e) {
    console.error("DELETE /api/beacons/[beaconId]/check-in:", e);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
