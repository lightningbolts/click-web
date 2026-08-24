import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/server/admin/supabaseAdmin";
import { loadPublicUpcomingEvents } from "@/lib/events/publicEvent";

/**
 * GET /api/beacons/public-events — unauthenticated upcoming events with visibility_audience=everyone.
 */
export async function GET() {
  try {
    const admin = createAdminSupabaseClient();
    const events = await loadPublicUpcomingEvents(admin);
    return NextResponse.json({ events });
  } catch (e) {
    console.error("GET /api/beacons/public-events:", e);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(_request: NextRequest) {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}
