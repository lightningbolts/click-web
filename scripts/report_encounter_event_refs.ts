/**
 * P2.1 data-quality report: connection_encounters.event_id vs event_beacon_id.
 *
 * event_id is Ticketmaster/registry text; event_beacon_id is map_beacons UUID.
 * Disagreement is event_id IS DISTINCT FROM event_beacon_id::text when both are set.
 *
 * Usage:
 *   cd click-web
 *   npx tsx scripts/report_encounter_event_refs.ts
 */

import { loadEnvFiles } from "./loadEnv";

loadEnvFiles();

import { createClient } from "@supabase/supabase-js";

async function main(): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Run from click-web with .env.local.",
    );
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  const page = 500;
  let offset = 0;
  let total = 0;
  let bothSet = 0;
  let onlyEventId = 0;
  let onlyEventBeaconId = 0;
  let disagree = 0;
  let neither = 0;

  while (true) {
    const { data, error } = await supabase
      .from("connection_encounters")
      .select("id, event_id, event_beacon_id")
      .range(offset, offset + page - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    if (rows.length === 0) break;

    for (const row of rows) {
      total += 1;
      const eventId = typeof row.event_id === "string" && row.event_id.trim() ? row.event_id : null;
      const beaconId =
        typeof row.event_beacon_id === "string" && row.event_beacon_id.trim() ? row.event_beacon_id : null;
      if (eventId && beaconId) {
        bothSet += 1;
        if (eventId !== beaconId) disagree += 1;
      } else if (eventId) {
        onlyEventId += 1;
      } else if (beaconId) {
        onlyEventBeaconId += 1;
      } else {
        neither += 1;
      }
    }

    offset += rows.length;
    if (rows.length < page) break;
  }

  console.log("[encounter-event-refs]", {
    total,
    bothSet,
    onlyEventId,
    onlyEventBeaconId,
    disagree,
    neither,
    note: "event_id is registry/Ticketmaster text; event_beacon_id is map_beacons UUID. Do not drop either column until this report is reviewed.",
  });
}

main().catch((err: unknown) => {
  console.error("[encounter-event-refs] fatal:", err instanceof Error ? err.message : err);
  process.exit(1);
});
