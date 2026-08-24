import { NextRequest, NextResponse } from "next/server";
import { getSupabaseFromRouteRequest } from "@/lib/server/supabaseRouteAuth";
import { createAdminSupabaseClient } from "@/lib/server/admin/supabaseAdmin";
import { userMayAccessBusinessInsights } from "@/lib/server/businessInsightsEligibility";
import { loadRecapSummary } from "@/lib/events/eventRecap";
import {
  eventEndAtFromMetadata,
  eventStartAtFromMetadata,
  eventTitleFromMetadata,
  isRecord,
} from "@/lib/events/eventMetadata";

/**
 * GET /api/insights/[venueId]/network-health-trend
 * One point per completed event beacon at this venue.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ venueId: string }> },
) {
  try {
    const { venueId } = await params;
    const { supabase, user, authError } = await getSupabaseFromRouteRequest(request);
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!(await userMayAccessBusinessInsights(supabase, user))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: membership } = await supabase
      .from("venue_managers")
      .select("id")
      .eq("venue_id", venueId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!membership) {
      return NextResponse.json({ error: "Not a manager for this venue" }, { status: 403 });
    }

    const admin = createAdminSupabaseClient();
    const { data: rows, error } = await admin
      .from("map_beacons")
      .select("id, metadata, beacon_type, venue_id")
      .eq("venue_id", venueId)
      .eq("beacon_type", "event")
      .order("created_at", { ascending: true })
      .limit(80);

    if (error) {
      console.error("network-health-trend:", error.message);
      return NextResponse.json({ error: "Failed to load events" }, { status: 500 });
    }

    const now = Date.now();
    const events: Array<Record<string, unknown>> = [];
    for (const row of Array.isArray(rows) ? rows : []) {
      if (!isRecord(row) || typeof row.id !== "string") continue;
      const meta = isRecord(row.metadata) ? row.metadata : {};
      const endIso = eventEndAtFromMetadata(meta);
      const endMs = endIso ? Date.parse(endIso) : Number.NaN;
      if (!Number.isFinite(endMs) || endMs > now) continue;
      const summary = await loadRecapSummary(admin, row.id);
      events.push({
        ...summary,
        title: eventTitleFromMetadata(meta),
        event_start_at: eventStartAtFromMetadata(meta),
        event_end_at: endIso,
      });
    }

    return NextResponse.json({ events });
  } catch (e) {
    console.error("GET /api/insights/[venueId]/network-health-trend:", e);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
