import { NextRequest, NextResponse } from "next/server";
import { getSupabaseFromRouteRequest } from "@/lib/server/supabaseRouteAuth";
import { createAdminSupabaseClient } from "@/lib/server/admin/supabaseAdmin";
import { userMayAccessBusinessInsights } from "@/lib/server/businessInsightsEligibility";
import { parseLatLngFromLocationField } from "@/lib/map/mapBeaconApiShared";
import { countEventRsvpsByBeaconIds } from "@/lib/events/publicEvent";
import {
  eventDescriptionFromMetadata,
  eventDisplayTitle,
  eventEndAtFromMetadata,
  eventImageFromMetadata,
  eventLocationNameFromMetadata,
  eventStartAtFromMetadata,
  eventTitleFromMetadata,
  isRecord,
  parseBeaconMetadata,
  rsvpEnabledFromMetadata,
} from "@/lib/events/eventMetadata";

/**
 * GET /api/insights/[venueId]/events — venue event list for Insights Events tab.
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
    const { data, error } = await admin
      .from("map_beacons")
      .select("id, metadata, location, beacon_type")
      .eq("venue_id", venueId)
      .eq("beacon_type", "event")
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      console.error("insights venue events:", error.message);
      return NextResponse.json({ error: "Failed to load events" }, { status: 500 });
    }

    const rows = Array.isArray(data) ? data : [];
    const rsvpCountById = await countEventRsvpsByBeaconIds(
      admin,
      rows.map((row) => (isRecord(row) && typeof row.id === "string" ? row.id : "")).filter(Boolean),
    );
    const events = [];
    for (const row of rows) {
      if (!isRecord(row) || typeof row.id !== "string") continue;
      const meta = parseBeaconMetadata(row.metadata);
      const coords = parseLatLngFromLocationField(row.location, Number.NaN, Number.NaN);
      events.push({
        beacon_id: row.id,
        title: eventDisplayTitle(
          eventTitleFromMetadata(meta),
          eventLocationNameFromMetadata(meta),
          eventDescriptionFromMetadata(meta),
        ),
        description: eventDescriptionFromMetadata(meta),
        image_url: eventImageFromMetadata(meta),
        event_start_at: eventStartAtFromMetadata(meta),
        event_end_at: eventEndAtFromMetadata(meta),
        location_name: eventLocationNameFromMetadata(meta),
        latitude: Number.isFinite(coords.lat) ? coords.lat : null,
        longitude: Number.isFinite(coords.lng) ? coords.lng : null,
        rsvp_count: rsvpCountById.get(row.id) ?? 0,
        rsvp_enabled: rsvpEnabledFromMetadata(meta),
      });
    }
    return NextResponse.json({ events });
  } catch (e) {
    console.error("GET /api/insights/[venueId]/events:", e);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
