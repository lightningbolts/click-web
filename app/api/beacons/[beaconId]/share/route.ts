import { NextRequest, NextResponse } from "next/server";
import { getSupabaseFromRouteRequest } from "@/lib/server/supabaseRouteAuth";
import { createAdminSupabaseClient } from "@/lib/server/admin/supabaseAdmin";
import {
  insertEngagementEvent,
  loadEventBeaconOrResponse,
  parseEngagementTelemetryBody,
} from "@/lib/server/eventEngagement";
import { parseBody } from "@/lib/api/parseBody";
import { engagementTelemetryBodySchema } from "@/lib/api/schemas/beacons";

/**
 * POST /api/beacons/{id}/share — fire-and-forget share telemetry.
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

    const parsed = await parseBody(request, engagementTelemetryBodySchema);
    if (!parsed.ok) return parsed.response;
    const body = parsed.data;
    const telemetry = parseEngagementTelemetryBody(body);

    const admin = createAdminSupabaseClient();
    const loaded = await loadEventBeaconOrResponse(admin, beaconId);
    if ("response" in loaded) return loaded.response;
    const { beacon } = loaded;

    const shareUrl =
      typeof (body as { share_url?: unknown } | null)?.share_url === "string"
        ? (body as { share_url: string }).share_url.trim().slice(0, 500)
        : null;

    await insertEngagementEvent(admin, {
      beacon_id: beaconId,
      user_id: user.id,
      venue_id: beacon.venue_id,
      event_type: "share",
      latitude: telemetry.latitude,
      longitude: telemetry.longitude,
      accuracy_meters: telemetry.accuracy_meters,
      client_occurred_at: telemetry.client_occurred_at,
      source: telemetry.source ?? "mobile",
      platform: telemetry.platform,
      app_version: telemetry.app_version,
      metadata: {
        ...(telemetry.surface ? { surface: telemetry.surface } : {}),
        ...(shareUrl ? { share_url: shareUrl } : {}),
      },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("POST /api/beacons/[beaconId]/share:", e);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
