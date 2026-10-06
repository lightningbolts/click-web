import "server-only";

import { cache } from "react";
import { eventAccessFor, loadBeaconManageRow, type EventAccess } from "@/lib/events/beaconManageAuth";
import { isRecord } from "@/lib/events/eventMetadata";
import type { PublicEventPayload } from "@/lib/events/publicEvent";
import { createAdminSupabaseClient } from "@/lib/server/admin/supabaseAdmin";
import { getServerUser } from "@/lib/server/getServerUser";
import { loadPublicEvent } from "@/lib/server/events/loadPublicEvent";

export type EventManageContext =
  | { kind: "signed-out" }
  | { kind: "missing" }
  | { kind: "forbidden" }
  | {
      kind: "ok";
      userId: string;
      access: EventAccess;
      event: PublicEventPayload;
      /** The hosting Place (listed or not) for the Business breadcrumb. */
      place: { id: string; name: string } | null;
      summary: { published: boolean; token: string | null };
    };

/**
 * Authorizes the manage page once per request (React `cache`, shared by the layout and the
 * tab page): creator and Place owners / managers manage, Place viewers read (spec §7.6.4).
 */
export const loadEventManageContext = cache(async (beaconId: string): Promise<EventManageContext> => {
  const user = await getServerUser();
  if (!user) return { kind: "signed-out" };
  const admin = createAdminSupabaseClient();
  const beacon = await loadBeaconManageRow(admin, beaconId);
  if (beacon == null || beacon.beacon_type !== "event") return { kind: "missing" };
  const access = await eventAccessFor(admin, user.id, beacon);
  if (access == null) return { kind: "forbidden" };

  const [event, placeRes, metaRes] = await Promise.all([
    loadPublicEvent(beaconId),
    beacon.venue_id
      ? admin.from("places").select("id, name").eq("id", beacon.venue_id).maybeSingle()
      : Promise.resolve({ data: null }),
    admin.from("map_beacons").select("metadata").eq("id", beaconId).maybeSingle(),
  ]);
  if (event == null) return { kind: "missing" };

  const placeRow = placeRes.data;
  const meta = isRecord(metaRes.data) && isRecord(metaRes.data.metadata) ? metaRes.data.metadata : {};
  const token = typeof meta.summary_token === "string" && meta.summary_token ? meta.summary_token : null;
  return {
    kind: "ok",
    userId: user.id,
    access,
    event,
    place:
      isRecord(placeRow) && typeof placeRow.id === "string" && typeof placeRow.name === "string"
        ? { id: placeRow.id, name: placeRow.name }
        : null,
    summary: { published: meta.summary_published === true && token != null, token },
  };
});
