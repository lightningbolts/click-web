import { NextRequest, NextResponse } from "next/server";
import { getSupabaseFromRouteRequest } from "@/lib/server/supabaseRouteAuth";
import { userMayAccessBusinessInsights } from "@/lib/server/businessInsightsEligibility";
import type { VenuePopUpHubBeacon } from "@/lib/insights/vibeRadar";

const PERK_MAX = 500;
const CATEGORY_MAX = 80;
const DURATION_MIN = 15;
const DURATION_MAX = 10080;

/**
 * Deploy a temporary Pop-Up Hub beacon for the signed-in venue manager.
 */
export async function POST(request: NextRequest) {
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

    let body: {
      venue_id?: unknown;
      perk_description?: unknown;
      category_target?: unknown;
      duration_minutes?: unknown;
    };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const venueId = typeof body.venue_id === "string" ? body.venue_id.trim() : "";
    const perk =
      typeof body.perk_description === "string" ? body.perk_description.trim() : "";
    const categoryTarget =
      typeof body.category_target === "string" ? body.category_target.trim() : "";
    const durationRaw = body.duration_minutes;

    if (!venueId) {
      return NextResponse.json({ error: "venue_id is required" }, { status: 400 });
    }
    if (!perk || perk.length > PERK_MAX) {
      return NextResponse.json(
        { error: `perk_description is required (max ${PERK_MAX} characters)` },
        { status: 400 },
      );
    }
    if (!categoryTarget || categoryTarget.length > CATEGORY_MAX) {
      return NextResponse.json(
        { error: `category_target is required (max ${CATEGORY_MAX} characters)` },
        { status: 400 },
      );
    }

    const duration =
      typeof durationRaw === "number" && Number.isFinite(durationRaw)
        ? Math.round(durationRaw)
        : NaN;
    if (!Number.isFinite(duration) || duration < DURATION_MIN || duration > DURATION_MAX) {
      return NextResponse.json(
        {
          error: `duration_minutes must be between ${DURATION_MIN} and ${DURATION_MAX}`,
        },
        { status: 400 },
      );
    }

    const { data: membership, error: membershipError } = await supabase
      .from("venue_managers")
      .select("id")
      .eq("venue_id", venueId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (membershipError) {
      console.error("insights/beacons venue_managers:", membershipError.message);
      return NextResponse.json({ error: "Failed to verify access" }, { status: 500 });
    }

    if (!membership) {
      return NextResponse.json({ error: "Not a manager for this venue" }, { status: 403 });
    }

    const startsAt = new Date();
    const endsAt = new Date(startsAt.getTime() + duration * 60_000);

    const { data: row, error: insertError } = await supabase
      .from("venue_pop_up_hubs")
      .insert({
        venue_id: venueId,
        created_by: user.id,
        perk_description: perk,
        category_target: categoryTarget,
        duration_minutes: duration,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
      })
      .select(
        "id, venue_id, perk_description, category_target, duration_minutes, starts_at, ends_at, created_at",
      )
      .maybeSingle();

    if (insertError) {
      console.error("venue_pop_up_hubs insert:", insertError.message);
      return NextResponse.json({ error: insertError.message }, { status: 400 });
    }

    return NextResponse.json({ beacon: row as VenuePopUpHubBeacon });
  } catch (e) {
    console.error("POST /api/insights/beacons:", e);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
