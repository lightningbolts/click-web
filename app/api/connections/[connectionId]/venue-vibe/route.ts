import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const CATEGORIES = new Set([
  "music",
  "atmosphere",
  "crowd",
  "service",
  "general",
]);

function createAdminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  );
}

/**
 * POST — optional anonymous-ish venue vibe after a connection (feeds Business Insights / vibe_rating).
 * Body: { rating?: 1–5, category?: string, message?: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ connectionId: string }> },
) {
  try {
    const { connectionId } = await params;
    if (!connectionId) {
      return NextResponse.json({ error: "Missing connection id" }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const rating =
      typeof body.rating === "number" && body.rating >= 1 && body.rating <= 5
        ? Math.round(body.rating)
        : undefined;
    const rawCat =
      typeof body.category === "string" ? body.category.trim().toLowerCase() : "";
    const category = CATEGORIES.has(rawCat) ? rawCat : "general";
    const message =
      typeof body.message === "string" ? body.message.trim().slice(0, 500) : "";

    if (rating === undefined && !message) {
      return NextResponse.json(
        { error: "Provide at least a 1–5 rating or a short message" },
        { status: 400 },
      );
    }

    const authHeader = request.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ")
      ? authHeader.slice(7)
      : null;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminClient();
    const { data: authData, error: authErr } = await admin.auth.getUser(token);
    if (authErr || !authData?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = authData.user.id;

    const { data: row, error: fetchErr } = await admin
      .from("connections")
      .select("id, user_ids, memory_capsule, vibe_rating")
      .eq("id", connectionId)
      .maybeSingle();

    if (fetchErr || !row) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    }

    const userIds = (row.user_ids as string[] | null) ?? [];
    if (!userIds.includes(userId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const prevCapsule =
      row.memory_capsule &&
      typeof row.memory_capsule === "object" &&
      !Array.isArray(row.memory_capsule)
        ? (row.memory_capsule as Record<string, unknown>)
        : {};

    const venueVibeCapture = {
      sentiment:
        rating === undefined
          ? "neutral"
          : rating >= 4
            ? "positive"
            : rating <= 2
              ? "negative"
              : "neutral",
      category,
      message: message || undefined,
      submittedAt: new Date().toISOString(),
      ...(rating !== undefined ? { rating } : {}),
    };

    const nextCapsule = {
      ...prevCapsule,
      venueVibeCapture,
    };

    const { error: upErr } = await admin
      .from("connections")
      .update({
        memory_capsule: nextCapsule,
        ...(rating !== undefined ? { vibe_rating: rating } : {}),
      })
      .eq("id", connectionId);

    if (upErr) {
      console.error("venue-vibe update:", upErr);
      return NextResponse.json({ error: "Failed to save" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("venue-vibe route:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
