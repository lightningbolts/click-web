import { NextRequest, NextResponse } from "next/server";
import { getSupabaseFromRouteRequest } from "@/lib/server/supabaseRouteAuth";
import { createAdminSupabaseClient } from "@/lib/server/admin/supabaseAdmin";
import { userMayAccessBusinessInsights } from "@/lib/server/businessInsightsEligibility";

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx] ?? null;
}

/**
 * GET /api/insights/[venueId]/event-engagement
 * Aggregated event funnel / arrival / reject / dwell metrics (no PII).
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
      return NextResponse.json({ error: "Failed to verify access" }, { status: 500 });
    }
    if (!membership) {
      return NextResponse.json({ error: "Not a manager for this venue" }, { status: 403 });
    }

    const admin = createAdminSupabaseClient();
    const { data: rows, error } = await admin
      .from("event_engagement_events")
      .select(
        "event_type, reject_reason, minutes_after_start, occurred_at, user_id, beacon_id, metadata",
      )
      .eq("venue_id", venueId)
      .order("occurred_at", { ascending: false })
      .limit(5000);

    if (error) {
      console.error("event-engagement insights:", error.message);
      return NextResponse.json({ error: "Failed to load engagement" }, { status: 500 });
    }

    const events = Array.isArray(rows) ? rows : [];
    let impressions = 0;
    let bookmarks = 0;
    let shares = 0;
    let rsvps = 0;
    let checkIns = 0;
    let checkOuts = 0;
    const rejectReasons: Record<string, number> = {};
    const arrivalBuckets: Record<string, number> = {
      early: 0,
      "0_30": 0,
      "30_60": 0,
      "60_plus": 0,
      unknown: 0,
    };

    const uniqueViewers = new Set<string>();
    const checkedInAt = new Map<string, number>();
    const dwellMinutes: number[] = [];

    for (const raw of events) {
      if (!isRecord(raw)) continue;
      const type = typeof raw.event_type === "string" ? raw.event_type : "";
      const userId = typeof raw.user_id === "string" ? raw.user_id : null;
      const beaconId = typeof raw.beacon_id === "string" ? raw.beacon_id : "";
      const key = `${userId ?? "?"}:${beaconId}`;

      if (type === "event_view") {
        impressions += 1;
        if (userId) uniqueViewers.add(userId);
      } else if (type === "bookmark_set") {
        bookmarks += 1;
      } else if (type === "share") {
        shares += 1;
      } else if (type === "rsvp_set") {
        rsvps += 1;
      } else if (type === "check_in") {
        checkIns += 1;
        const mins =
          typeof raw.minutes_after_start === "number" ? raw.minutes_after_start : null;
        if (mins == null) arrivalBuckets.unknown += 1;
        else if (mins < 0) arrivalBuckets.early += 1;
        else if (mins <= 30) arrivalBuckets["0_30"] += 1;
        else if (mins <= 60) arrivalBuckets["30_60"] += 1;
        else arrivalBuckets["60_plus"] += 1;
        if (typeof raw.occurred_at === "string") {
          const ms = Date.parse(raw.occurred_at);
          if (Number.isFinite(ms)) checkedInAt.set(key, ms);
        }
      } else if (type === "check_out") {
        checkOuts += 1;
        if (typeof raw.occurred_at === "string") {
          const outMs = Date.parse(raw.occurred_at);
          const inMs = checkedInAt.get(key);
          if (Number.isFinite(outMs) && inMs != null && outMs > inMs) {
            dwellMinutes.push((outMs - inMs) / 60_000);
          }
        }
      } else if (type === "check_in_rejected") {
        const reason =
          typeof raw.reject_reason === "string" && raw.reject_reason
            ? raw.reject_reason
            : "unknown";
        rejectReasons[reason] = (rejectReasons[reason] ?? 0) + 1;
      }
    }

    dwellMinutes.sort((a, b) => a - b);

    const interestRate = impressions > 0 ? bookmarks / impressions : null;
    const shareRate = impressions > 0 ? shares / impressions : null;
    const rsvpConversion = impressions > 0 ? rsvps / impressions : null;
    const checkInConversion = rsvps > 0 ? checkIns / rsvps : null;

    return NextResponse.json({
      venue_id: venueId,
      funnel: {
        impressions,
        unique_viewers: uniqueViewers.size,
        bookmarks,
        shares,
        rsvps,
        check_ins: checkIns,
        check_outs: checkOuts,
        interest_rate: interestRate,
        share_rate: shareRate,
        rsvp_conversion: rsvpConversion,
        rsvp_to_check_in: checkInConversion,
      },
      arrival_histogram: [
        { bucket: "early", count: arrivalBuckets.early },
        { bucket: "0_30", count: arrivalBuckets["0_30"] },
        { bucket: "30_60", count: arrivalBuckets["30_60"] },
        { bucket: "60_plus", count: arrivalBuckets["60_plus"] },
        { bucket: "unknown", count: arrivalBuckets.unknown },
      ],
      reject_reasons: Object.entries(rejectReasons).map(([reason, count]) => ({
        reason,
        count,
      })),
      dwell: {
        sample_size: dwellMinutes.length,
        p50_minutes: percentile(dwellMinutes, 50),
        p90_minutes: percentile(dwellMinutes, 90),
      },
    });
  } catch (e) {
    console.error("GET /api/insights/[venueId]/event-engagement:", e);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
