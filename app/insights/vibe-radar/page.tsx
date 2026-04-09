import { createSupabaseServerClient } from "@/lib/server/supabaseServer";
import { parseVibeRadarRpcPayload } from "@/lib/insights/vibeRadar";
import type { VibeRadarApiResponse } from "@/lib/insights/vibeRadar";
import VibeRadarClient from "@/components/insights/VibeRadarClient";

export default async function VibeRadarPage() {
  let initialPayload: VibeRadarApiResponse | null = null;

  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const meta = user.user_metadata?.venue_id;
      let venueId = typeof meta === "string" ? meta.trim() : "";
      if (!venueId) {
        const { data: row } = await supabase
          .from("venue_managers")
          .select("venue_id")
          .eq("user_id", user.id)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        venueId = row?.venue_id ?? "";
      }

      if (venueId) {
        const { data: rpcRaw, error } = await supabase.rpc("insights_vibe_radar_data", {
          venue_id_param: venueId,
        });

        if (!error && rpcRaw != null) {
          const parsed = parseVibeRadarRpcPayload(rpcRaw);
          initialPayload = { ...parsed, venueId };
        } else if (error) {
          console.warn("Vibe Radar server prefetch:", error.message);
        }
      }
    }
  } catch (e) {
    console.warn("Vibe Radar server bootstrap:", e);
  }

  return <VibeRadarClient initialPayload={initialPayload} />;
}
