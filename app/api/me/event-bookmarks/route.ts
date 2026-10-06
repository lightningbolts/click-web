import { NextRequest, NextResponse } from "next/server";
import { getSupabaseFromRouteRequest } from "@/lib/server/supabaseRouteAuth";
import { createAdminSupabaseClient } from "@/lib/server/admin/supabaseAdmin";
import { loadEventBookmarks } from "@/lib/server/events/eventBookmarks";

/**
 * GET /api/me/event-bookmarks — caller's saved events (denormalized for Home).
 * Query: limit (default 50, max 100), cursor (ISO created_at).
 */
export async function GET(request: NextRequest) {
  try {
    const { user, authError } = await getSupabaseFromRouteRequest(request);
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const limitRaw = Number(searchParams.get("limit") ?? 50);
    const limit = Number.isFinite(limitRaw)
      ? Math.min(100, Math.max(1, Math.floor(limitRaw)))
      : 50;
    const cursor = searchParams.get("cursor");

    return NextResponse.json(
      await loadEventBookmarks(createAdminSupabaseClient(), user.id, { limit, cursor }),
    );
  } catch (e) {
    console.error("GET /api/me/event-bookmarks:", e);
    return NextResponse.json({ error: "Failed to load bookmarks" }, { status: 500 });
  }
}
