import { NextRequest, NextResponse } from "next/server";
import { getSupabaseFromRouteRequest } from "@/lib/server/supabaseRouteAuth";
import { parseBody } from "@/lib/api/parseBody";
import { ghostModeBodySchema } from "@/lib/api/schemas/user";

/**
 * PATCH /api/user/ghost-mode — persist users.ghost_mode for mutual-attendee privacy.
 */
export async function PATCH(request: NextRequest) {
  try {
    const { user, supabase, authError } = await getSupabaseFromRouteRequest(request);
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsed = await parseBody(request, ghostModeBodySchema);
    if (!parsed.ok) return parsed.response;

    const { error } = await supabase
      .from("users")
      .update({ ghost_mode: parsed.data.enabled })
      .eq("id", user.id);
    if (error) {
      console.error("PATCH ghost-mode:", error.message);
      return NextResponse.json({ error: "Failed to save ghost mode" }, { status: 500 });
    }
    return NextResponse.json({ ok: true, ghost_mode: parsed.data.enabled });
  } catch (e) {
    console.error("PATCH /api/user/ghost-mode:", e);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
