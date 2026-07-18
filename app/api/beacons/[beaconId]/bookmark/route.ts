import { NextRequest, NextResponse } from "next/server";
import { getSupabaseFromRouteRequest } from "@/lib/server/supabaseRouteAuth";
import { createAdminSupabaseClient } from "@/lib/server/admin/supabaseAdmin";
import {
  insertEngagementEvent,
  loadEventBeaconOrResponse,
  minutesBeforeStart,
  parseEngagementTelemetryBody,
} from "@/lib/server/eventEngagement";

/**
 * GET — whether the current user bookmarked this event.
 * PUT — idempotent set `{ bookmarked: true|false }`.
 * DELETE — clear bookmark (bookmarked: false).
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

    const { data, error } = await admin
      .from("event_bookmarks")
      .select("beacon_id")
      .eq("beacon_id", beaconId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      console.error("GET bookmark:", error.message);
      return NextResponse.json({ error: "Failed to load bookmark" }, { status: 500 });
    }

    return NextResponse.json({
      beacon_id: beaconId,
      bookmarked: data != null,
    });
  } catch (e) {
    console.error("GET /api/beacons/[beaconId]/bookmark:", e);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function PUT(
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
    const bookmarked = telemetry.bookmarked;
    if (bookmarked == null) {
      return NextResponse.json({ error: "bookmarked boolean required" }, { status: 400 });
    }

    const admin = createAdminSupabaseClient();
    const loaded = await loadEventBeaconOrResponse(admin, beaconId);
    if ("response" in loaded) return loaded.response;
    const { beacon } = loaded;

    if (bookmarked) {
      const mins = minutesBeforeStart(beacon.metadata);
      const { error } = await admin.from("event_bookmarks").upsert(
        {
          user_id: user.id,
          beacon_id: beaconId,
          updated_at: new Date().toISOString(),
          minutes_before_start: mins,
          source: telemetry.source,
          platform: telemetry.platform,
          app_version: telemetry.app_version,
        },
        { onConflict: "user_id,beacon_id" },
      );
      if (error) {
        console.error("PUT bookmark upsert:", error.message);
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      await insertEngagementEvent(admin, {
        beacon_id: beaconId,
        user_id: user.id,
        venue_id: beacon.venue_id,
        event_type: "bookmark_set",
        client_occurred_at: telemetry.client_occurred_at,
        source: telemetry.source,
        platform: telemetry.platform,
        app_version: telemetry.app_version,
        minutes_before_start: mins,
      });
    } else {
      const { error } = await admin
        .from("event_bookmarks")
        .delete()
        .eq("user_id", user.id)
        .eq("beacon_id", beaconId);
      if (error) {
        console.error("PUT bookmark delete:", error.message);
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      await insertEngagementEvent(admin, {
        beacon_id: beaconId,
        user_id: user.id,
        venue_id: beacon.venue_id,
        event_type: "bookmark_unset",
        client_occurred_at: telemetry.client_occurred_at,
        source: telemetry.source,
        platform: telemetry.platform,
        app_version: telemetry.app_version,
      });
    }

    return NextResponse.json({ ok: true, bookmarked });
  } catch (e) {
    console.error("PUT /api/beacons/[beaconId]/bookmark:", e);
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

    const { error } = await admin
      .from("event_bookmarks")
      .delete()
      .eq("user_id", user.id)
      .eq("beacon_id", beaconId);
    if (error) {
      console.error("DELETE bookmark:", error.message);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    await insertEngagementEvent(admin, {
      beacon_id: beaconId,
      user_id: user.id,
      venue_id: beacon.venue_id,
      event_type: "bookmark_unset",
    });

    return NextResponse.json({ ok: true, bookmarked: false });
  } catch (e) {
    console.error("DELETE /api/beacons/[beaconId]/bookmark:", e);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
