import { NextRequest, NextResponse } from "next/server";
import { getSupabaseFromRouteRequest } from "@/lib/server/supabaseRouteAuth";
import { userMayAccessBusinessInsights } from "@/lib/server/businessInsightsEligibility";
import { resolveInsightsVenueId } from "@/lib/server/resolveInsightsVenueId";
import { parseVibeRadarRpcPayload, type VibeRadarApiResponse } from "@/lib/insights/vibeRadar";

/**
 * Aggregated availability intent clusters near the venue (no user-level data).
 * Auth: business insights + venue manager for `venue_id`.
 */
export async function GET(request: NextRequest) {
  try {
    const { supabase, user, authError } = await getSupabaseFromRouteRequest(request);
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!(await userMayAccessBusinessInsights(supabase, user))) {
      return NextResponse.json(
        { error: "Forbidden: Requires verified business or active venue subscription" },
        { status: 403 },
      );
    }

    const venueId = await resolveInsightsVenueId(request, supabase, user);
    if (!venueId) {
      const body: VibeRadarApiResponse = {
        clusters: [],
        categoryTotals: [],
        venueCenter: { lat: null, lng: null },
        radiusMeters: 1609.34,
        status: "no_venue",
        message: "Link a venue to load Vibe Radar.",
      };
      return NextResponse.json(body);
    }

    const { data: membership, error: membershipError } = await supabase
      .from("venue_managers")
      .select("id")
      .eq("venue_id", venueId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (membershipError) {
      console.error("insights/intents venue_managers:", membershipError.message);
      return NextResponse.json({ error: "Failed to verify access" }, { status: 500 });
    }

    if (!membership) {
      return NextResponse.json({ error: "Not a manager for this venue" }, { status: 403 });
    }

    const { data: rpcData, error: rpcError } = await supabase.rpc("insights_vibe_radar_data", {
      venue_id_param: venueId,
    });

    if (rpcError) {
      const msg = rpcError.message ?? "";
      const forbidden =
        msg.includes("not authorized") || msg.includes("Not authorized");
      console.error("insights_vibe_radar_data:", msg);
      return NextResponse.json(
        { error: forbidden ? "Forbidden" : "Failed to load intent aggregates", detail: msg },
        { status: forbidden ? 403 : 500 },
      );
    }

    const parsed = parseVibeRadarRpcPayload(rpcData);
    const body: VibeRadarApiResponse = {
      ...parsed,
      venueId,
    };

    return NextResponse.json(body);
  } catch (e) {
    console.error("GET /api/insights/intents:", e);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
