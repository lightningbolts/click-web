import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const cookieStore = await cookies();

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                // @ts-ignore - ReadonlyRequestCookies doesn't have set, but we handle the error
                (cookieStore as any).set(name, value, options),
              );
            } catch {
              // The `setAll` method was called from a Server Component.
              // This can be ignored if you have middleware refreshing
              // user sessions.
            }
          },
        },
      },
    );

    // 1. Auth Check
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      console.error("Auth Error:", authError);
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Role Check
    // Query public.users table for role
    const { data: userProfile, error: profileError } = await supabase
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single();

    console.log("User ID:", user.id);
    console.log("User Email:", user.email);
    console.log("Profile Query Result:", { userProfile, profileError });

    // Allow specific emails for development/testing
    const allowedDevEmails = ["timberlake2025@gmail.com"];
    const isDevUser = allowedDevEmails.includes(user.email || "");

    if (
      !isDevUser &&
      (profileError || userProfile?.role !== "verified_business")
    ) {
      return NextResponse.json(
        {
          error: "Forbidden: Requires verified_business role",
          debug: {
            profileError: profileError?.message,
            role: userProfile?.role,
          },
        },
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

    // If no venue_id, return mock/demo data for development
    if (!venueId) {
      // Return demo data for development/testing
      const demoHourlyDistribution = [
        2, 1, 0, 0, 0, 0, 1, 3, 8, 15, 22, 28, 35, 42, 38, 45, 52, 58, 65, 72,
        68, 55, 42, 28,
      ];
      const demoDailyData: { date: string; count: number }[] = [];
      const now = new Date();
      for (let i = 29; i >= 0; i--) {
        const date = new Date(now);
        date.setDate(date.getDate() - i);
        demoDailyData.push({
          date: date.toISOString().split("T")[0],
          count: Math.floor(Math.random() * 30) + 10 + (i < 7 ? 15 : 0), // Higher recent activity
        });
      }

      // Sort a copy so demoDailyData (date-ascending order) is NOT mutated
      const busiestDemoEntry = [...demoDailyData].sort(
        (a, b) => b.count - a.count,
      )[0];
      const busiestDemoDay = busiestDemoEntry
        ? (() => {
            const [y, m, d] = busiestDemoEntry.date.split("-").map(Number);
            return new Date(y, m - 1, d).toLocaleDateString("en-US", {
              weekday: "long",
              month: "short",
              day: "numeric",
            });
          })()
        : "Saturday";

      return NextResponse.json({
        totalConnections: 847,
        hourlyDistribution: demoHourlyDistribution,
        dailyData: demoDailyData,
        peakHour: 19,
        retentionRate: "68%",
        busiestDay: busiestDemoDay,
        isDemo: true,
      });
    }

    // 4. Query Connections
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: connections, error: connectionsError } = await supabase
      .from("connections")
      .select("created_at, created") // Select both to be safe
      .eq("location_id", venueId)
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
