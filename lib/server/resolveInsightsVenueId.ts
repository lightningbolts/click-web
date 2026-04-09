import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";

/**
 * Venue id for insights APIs: query param, user metadata, or first venue_managers row.
 */
export async function resolveInsightsVenueId(
  request: NextRequest,
  supabase: SupabaseClient,
  user: User,
): Promise<string | null> {
  const q = request.nextUrl.searchParams.get("venue_id")?.trim();
  if (q) {
    return q;
  }

  const meta = user.user_metadata?.venue_id;
  if (typeof meta === "string" && meta.trim()) {
    return meta.trim();
  }

  const { data, error } = await supabase
    .from("venue_managers")
    .select("venue_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn("resolveInsightsVenueId:", error.message);
    return null;
  }

  return data?.venue_id ?? null;
}
