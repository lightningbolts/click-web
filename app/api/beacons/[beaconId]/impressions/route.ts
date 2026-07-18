import { NextRequest, NextResponse } from "next/server";
import { getSupabaseFromRouteRequest } from "@/lib/server/supabaseRouteAuth";
import { createAdminSupabaseClient } from "@/lib/server/admin/supabaseAdmin";
import {
  insertEngagementEvent,
  loadEventBeaconOrResponse,
  parseEngagementTelemetryBody,
} from "@/lib/server/eventEngagement";

const recentViews = new Map<string, number>();
const IMPRESSION_DEBOUNCE_MS = 2000;

/**
 * POST /api/beacons/{id}/impressions — fire-and-forget event_view telemetry.
 */
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

    const key = `${user.id}:${beaconId}`;
    const now = Date.now();
    const last = recentViews.get(key) ?? 0;
    if (now - last < IMPRESSION_DEBOUNCE_MS) {
      return NextResponse.json({ ok: true, debounced: true });
    }
    recentViews.set(key, now);
    // Bound map size
    if (recentViews.size > 10_000) {
      const cutoff = now - 60_000;
      for (const [k, t] of recentViews) {
        if (t < cutoff) recentViews.delete(k);
      }
    }

    await insertEngagementEvent(admin, {
      beacon_id: beaconId,
      user_id: user.id,
      venue_id: beacon.venue_id,
      event_type: "event_view",
      latitude: telemetry.latitude,
      longitude: telemetry.longitude,
      accuracy_meters: telemetry.accuracy_meters,
      client_occurred_at: telemetry.client_occurred_at,
      source: telemetry.source ?? "mobile",
      platform: telemetry.platform,
      app_version: telemetry.app_version,
      metadata: telemetry.surface ? { surface: telemetry.surface } : {},
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("POST /api/beacons/[beaconId]/impressions:", e);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
