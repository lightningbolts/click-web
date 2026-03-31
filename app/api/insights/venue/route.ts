import { NextRequest, NextResponse } from "next/server";
import { getSupabaseFromRouteRequest } from "@/lib/server/supabaseRouteAuth";
import { userMayAccessBusinessInsights } from "@/lib/server/businessInsightsEligibility";

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

    // 3. Get Venue ID
    const { searchParams } = new URL(request.url);
    let venueId = searchParams.get("venue_id");

    if (!venueId) {
      // Try to get from user metadata
      venueId = user.user_metadata?.venue_id;
    }

    // No venue linked — return empty aggregates (no demo/sample analytics).
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
      });
    }

    // 4. Query Connections
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: connections, error: connectionsError } = await supabase
      .from("connections")
      .select("created_at, created") // Select both to be safe
      .eq("location_id", venueId)
      .eq("include_in_business_insights", true)
      .gte("created_at", thirtyDaysAgo.toISOString());

    if (connectionsError) {
      console.error("Error fetching connections:", connectionsError);
      return NextResponse.json(
        { error: "Failed to fetch data" },
        { status: 500 },
      );
    }

    // 5. Privacy Check (k-anonymity)
    const totalConnections = connections.length;
    if (totalConnections < 5) {
      return NextResponse.json({
        status: "insufficient_data",
        message:
          "Insufficient Data: Less than 5 connections in the last 30 days.",
      });
    }

    // 6. Process Data
    // Histogram by hour
    const hourlyDistribution = new Array(24).fill(0);
    // Daily distribution for line chart
    const dailyDistribution: Record<string, number> = {};

    connections.forEach((conn) => {
      // Use created_at if available, otherwise created (assuming timestamp or ISO)
      const dateStr = conn.created_at || conn.created;
      const date = new Date(dateStr);

      // Hourly
      const hour = date.getHours();
      hourlyDistribution[hour]++;

      // Daily (YYYY-MM-DD)
      const dayKey = date.toISOString().split("T")[0];
      dailyDistribution[dayKey] = (dailyDistribution[dayKey] || 0) + 1;
    });

    // Format daily data for chart
    const dailyData = Object.entries(dailyDistribution)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Calculate Peak Hour
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

    return NextResponse.json({
      totalConnections,
      hourlyDistribution,
      dailyData,
      peakHour,
      retentionRate: "N/A",
      busiestDay: busiestRealDay,
    });
  } catch (error) {
    console.error("API Error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
