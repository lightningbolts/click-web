import { NextRequest, NextResponse } from "next/server";
import { getSupabaseFromRouteRequest } from "@/lib/server/supabaseRouteAuth";
import { userMayAccessBusinessInsights } from "@/lib/server/businessInsightsEligibility";
import {
  parseAmsJson,
  parseAcrJson,
  parseWriJson,
  parsePsvJson,
  parsePeerPercentiles,
  type AdvancedMetricsApiResponse,
} from "@/lib/insights/advancedMetrics";

/**
 * Advanced Social ROI metrics for a venue (RPC-backed).
 * Requires business insights access and membership in `venue_managers` for `[venueId]`.
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
      return NextResponse.json(
        { error: "Forbidden: Requires verified business or active venue subscription" },
        { status: 403 },
      );
    }

    const { data: membership, error: membershipError } = await supabase
      .from("venue_managers")
      .select("id")
      .eq("venue_id", venueId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (membershipError) {
      console.error("advanced-metrics: venue_managers", membershipError.message);
      return NextResponse.json({ error: "Failed to verify access" }, { status: 500 });
    }

    if (!membership) {
      return NextResponse.json(
        { error: "Not a manager for this venue" },
        { status: 403 },
      );
    }

    const rpcArgs = { venue_id_param: venueId };

    const [vlc, ams, acr, cpr, wri, psv, gcr] = await Promise.all([
      supabase.rpc("calculate_vlc", rpcArgs),
      supabase.rpc("calculate_ams", rpcArgs),
      supabase.rpc("calculate_acr", rpcArgs),
      supabase.rpc("calculate_cpr", rpcArgs),
      supabase.rpc("calculate_wri", rpcArgs),
      supabase.rpc("calculate_psv", rpcArgs),
      supabase.rpc("calculate_gcr", rpcArgs),
    ]);

    const errors = [vlc.error, ams.error, acr.error, cpr.error, wri.error, psv.error, gcr.error].filter(
      Boolean,
    );
    if (errors.length > 0) {
      const msg = errors.map((e) => e!.message).join("; ");
      const unauthorized = errors.some(
        (e) =>
          e!.message.includes("not authorized") ||
          e!.message.includes("Not authorized"),
      );
      console.error("advanced-metrics RPC:", msg);
      return NextResponse.json(
        { error: unauthorized ? "Forbidden" : "Metrics unavailable", detail: msg },
        { status: unauthorized ? 403 : 500 },
      );
    }

    let peerPercentiles = null;
    const peerRes = await supabase.rpc("insights_peer_percentiles", {
      venue_id_param: venueId,
    });
    if (!peerRes.error && peerRes.data != null) {
      peerPercentiles = parsePeerPercentiles(peerRes.data);
    } else if (peerRes.error) {
      console.warn("insights_peer_percentiles:", peerRes.error.message);
    }

    const body: AdvancedMetricsApiResponse = {
      venueId,
      venueLoyaltyCoefficient: Number(vlc.data ?? 0),
      anchorMagnetism: parseAmsJson(ams.data),
      acousticConversion: parseAcrJson(acr.data),
      crossPollinationRate: Number(cpr.data ?? 0),
      weatherResilience: parseWriJson(wri.data),
      peakSocialVelocity: parsePsvJson(psv.data),
      groupClusteringRate: Number(gcr.data ?? 0),
      peerPercentiles,
    };

    return NextResponse.json(body);
  } catch (error) {
    console.error("advanced-metrics API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
