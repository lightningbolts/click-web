import { NextRequest, NextResponse } from "next/server";
import { getSupabaseFromRouteRequest } from "@/lib/server/supabaseRouteAuth";
import { userMayAccessBusinessInsights } from "@/lib/server/businessInsightsEligibility";
import { buildInsightsVenueAugmentation } from "@/lib/server/insightsVenueAugmentation";

const emptyAugmentation = {
  heatmapZones: [] as unknown[],
  vibeMessages: [] as unknown[],
  liveCount: {
    current: 0,
    peak: 0,
    peakTime: "—",
    capacity: 1,
    trend: Array(12).fill(0),
  },
  connectionDensity: {
    value: 0,
    totalArea: 0,
    activeZones: 0,
    trend: "stable" as const,
  },
  stickyScore: {
    score: 0,
    trend: "stable" as const,
    change: 0,
    breakdown: {
      repeatVisitors: 0,
      avgConnectionsPerVisit: 0,
      communityEngagement: 0,
    },
  },
};

export async function GET(request: NextRequest) {
  try {
    const { supabase, user, authError } = await getSupabaseFromRouteRequest(request);

    if (authError || !user) {
      if (authError) {
        console.error("Auth Error:", authError);
      }
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const mayAccess = await userMayAccessBusinessInsights(supabase, user);
    if (!mayAccess) {
      return NextResponse.json(
        { error: "Forbidden: Requires verified_business role" },
        { status: 403 },
      );
    }

    const { searchParams } = new URL(request.url);
    let venueId = searchParams.get("venue_id");

    if (!venueId) {
      venueId = user.user_metadata?.venue_id;
    }

    if (!venueId) {
      return NextResponse.json({
        status: "no_venue",
        message:
          "Link a venue to your account to see insights. Until then, charts stay empty.",
        totalConnections: 0,
        hourlyDistribution: new Array(24).fill(0),
        dailyData: [] as { date: string; count: number }[],
        peakHour: 0,
        retentionRate: "0%",
        busiestDay: "N/A",
        ...emptyAugmentation,
      });
    }

    const { data: membership, error: membershipError } = await supabase
      .from("venue_managers")
      .select("id")
      .eq("venue_id", venueId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (membershipError) {
      console.error("insights/venue venue_managers:", membershipError.message);
      return NextResponse.json({ error: "Failed to verify access" }, { status: 500 });
    }

    if (!membership) {
      return NextResponse.json(
        { error: "Not a manager for this venue" },
        { status: 403 },
      );
    }

    const { data: venueRow, error: venueError } = await supabase
      .from("venues")
      .select("id, name, location")
      .eq("id", venueId)
      .maybeSingle();

    if (venueError || !venueRow) {
      return NextResponse.json({ error: "Venue not found" }, { status: 404 });
    }

    const venueName = venueRow.name?.trim() || "Venue";

    const thirtyDaysAgoMs = Date.now() - 30 * 86400000;

    const { data: connections, error: connectionsError } = await supabase
      .from("connections")
      .select("id, created, expiry_state, last_message_at, vibe_rating")
      .or(`venue_id.eq.${venueId},location_id.eq.${venueId}`)
      .eq("include_in_business_insights", true)
      .eq("source", "handshake")
      .gt("created", thirtyDaysAgoMs);

    if (connectionsError) {
      console.error("Error fetching connections:", connectionsError);
      return NextResponse.json(
        { error: "Failed to fetch data" },
        { status: 500 },
      );
    }

    const rows = connections ?? [];
    const totalConnections = rows.length;
    if (totalConnections < 5) {
      return NextResponse.json({
        status: "insufficient_data",
        message:
          "Insufficient Data: Less than 5 connections in the last 30 days.",
        ...emptyAugmentation,
      });
    }

    const hourlyDistribution = new Array(24).fill(0);
    const dailyDistribution: Record<string, number> = {};
    let keptCount = 0;

    for (const conn of rows) {
      const ts = typeof conn.created === "number" ? conn.created : 0;
      const date = new Date(ts);
      const hour = date.getHours();
      hourlyDistribution[hour]++;

      const dayKey = date.toISOString().split("T")[0];
      dailyDistribution[dayKey] = (dailyDistribution[dayKey] || 0) + 1;

      if (conn.expiry_state === "kept") keptCount += 1;
    }

    const dailyData = Object.entries(dailyDistribution)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const maxHourlyCount = Math.max(...hourlyDistribution);
    const peakHour = hourlyDistribution.indexOf(maxHourlyCount);

    const busiestRealEntry = [...dailyData].sort(
      (a, b) => b.count - a.count,
    )[0];
    const busiestRealDay = busiestRealEntry
      ? (() => {
          const [y, m, d] = busiestRealEntry.date.split("-").map(Number);
          return new Date(y, m - 1, d).toLocaleDateString("en-US", {
            weekday: "long",
            month: "short",
            day: "numeric",
          });
        })()
      : "N/A";

    const retentionRate =
      totalConnections > 0
        ? `${((keptCount / totalConnections) * 100).toFixed(1)}%`
        : "0%";

    const augmentation = await buildInsightsVenueAugmentation(
      supabase,
      venueId,
      venueName,
      rows,
    );

    return NextResponse.json({
      venueName,
      totalConnections,
      hourlyDistribution,
      dailyData,
      peakHour,
      retentionRate,
      busiestDay: busiestRealDay,
      heatmapZones: augmentation.heatmapZones,
      vibeMessages: augmentation.vibeMessages,
      liveCount: augmentation.liveCount,
      connectionDensity: augmentation.connectionDensity,
      stickyScore: augmentation.stickyScore,
    });
  } catch (error) {
    console.error("API Error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
