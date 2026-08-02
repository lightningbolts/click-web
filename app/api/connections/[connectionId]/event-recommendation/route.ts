import { NextRequest, NextResponse } from "next/server";
import { getSupabaseFromRouteRequest } from "@/lib/server/supabaseRouteAuth";
import { createAdminSupabaseClient } from "@/lib/server/admin/supabaseAdmin";
import { recommendConnectionEvent } from "@/lib/events/connectionEventRecommendation";

const UUID_RE = /^[0-9a-fA-F-]{36}$/;

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function parseOptionalCoord(raw: string | null): number | null {
  if (raw == null || raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * GET /api/connections/[connectionId]/event-recommendation
 * Auth required. 1:1 connections only; groups return `{ recommendation: null }`.
 * Optional query: lat, lng (viewer location for distance scoring).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ connectionId: string }> },
) {
  try {
    const { connectionId: rawId } = await params;
    const connectionId = rawId?.trim() ?? "";
    if (!UUID_RE.test(connectionId)) {
      return NextResponse.json({ error: "Invalid connection id" }, { status: 400 });
    }

    const { user, authError } = await getSupabaseFromRouteRequest(request);
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminSupabaseClient();
    const { data: row, error: fetchErr } = await admin
      .from("connections")
      .select("id, user_ids")
      .eq("id", connectionId)
      .maybeSingle();

    if (fetchErr) {
      console.error("GET event-recommendation connection:", fetchErr.message);
      return NextResponse.json({ error: "Failed to load connection" }, { status: 500 });
    }
    if (!isRecord(row)) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    }

    const userIds = Array.isArray(row.user_ids)
      ? row.user_ids.filter((id): id is string => typeof id === "string" && id.length > 0)
      : [];

    if (!userIds.includes(user.id)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Groups / multi-party: no single peer — skip recommendation.
    if (userIds.length !== 2) {
      return NextResponse.json({ recommendation: null });
    }

    const peerId = userIds.find((id) => id !== user.id);
    if (peerId == null) {
      return NextResponse.json({ recommendation: null });
    }

    const { searchParams } = new URL(request.url);
    const lat = parseOptionalCoord(searchParams.get("lat") ?? searchParams.get("latitude"));
    const lng = parseOptionalCoord(
      searchParams.get("lng") ??
        searchParams.get("lon") ??
        searchParams.get("longitude"),
    );
    const viewerLat =
      lat != null && lat >= -90 && lat <= 90 ? lat : null;
    const viewerLng =
      lng != null && lng >= -180 && lng <= 180 ? lng : null;

    const recommendation = await recommendConnectionEvent(
      admin,
      user.id,
      peerId,
      viewerLat,
      viewerLng,
    );

    return NextResponse.json({ recommendation });
  } catch (e) {
    console.error("GET /api/connections/[connectionId]/event-recommendation:", e);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
