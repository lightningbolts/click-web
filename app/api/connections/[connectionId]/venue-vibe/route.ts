import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const CATEGORIES = new Set([
  "music",
  "atmosphere",
  "crowd",
  "service",
  "general",
]);

type Sentiment = "positive" | "neutral" | "negative";

type VenueVibeCapture = {
  sentiment: Sentiment;
  category: string;
  message?: string;
  submittedAt: string;
  rating?: number;
};

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceRoleKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for admin client',
    );
  }
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function sentimentFromRating(rating: number | undefined): Sentiment {
  if (rating === undefined) {
    return "neutral";
  }
  if (rating >= 4) {
    return "positive";
  }
  if (rating <= 2) {
    return "negative";
  }
  return "neutral";
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
      .select("id, user_ids")
      .eq("id", connectionId)
      .maybeSingle();

    if (fetchErr || !row) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    }

    const userIds = (row.user_ids as string[] | null) ?? [];
    if (!userIds.includes(userId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: latestEncounter, error: encounterFetchErr } = await admin
      .from("connection_encounters")
      .select("id")
      .eq("connection_id", connectionId)
      .order("encountered_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (encounterFetchErr) {
      console.error("venue-vibe encounter fetch:", encounterFetchErr);
      return NextResponse.json({ error: "Failed to save" }, { status: 500 });
    }

    if (!latestEncounter) {
      return NextResponse.json({ error: "Encounter not found" }, { status: 404 });
    }

    const venueVibeCapture: VenueVibeCapture = {
      sentiment: sentimentFromRating(rating),
      category,
      message: message || undefined,
      submittedAt: new Date().toISOString(),
      ...(rating !== undefined ? { rating } : {}),
    };

    const { error: encounterUpdateErr } = await admin
      .from("connection_encounters")
      .update({ vibe_capture: venueVibeCapture })
      .eq("id", latestEncounter.id);

    if (encounterUpdateErr) {
      console.error("venue-vibe encounter update:", encounterUpdateErr);
      return NextResponse.json({ error: "Failed to save" }, { status: 500 });
    }

    if (rating !== undefined) {
      const { error: connectionUpdateErr } = await admin
        .from("connections")
        .update({ vibe_rating: rating })
        .eq("id", connectionId);

      if (connectionUpdateErr) {
        console.error("venue-vibe connection update:", connectionUpdateErr);
        return NextResponse.json({ error: "Failed to save" }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("venue-vibe route:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
