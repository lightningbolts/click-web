/**
 * Backfill map_beacons.attendee_count from event_participation (rsvpd + checked_in).
 *
 * Prerequisites:
 *   - Migrations 20260824010000 and 20260824050000 applied
 *   - event_participation backfill completed
 *
 * Usage:
 *   cd click-web
 *   npx tsx scripts/backfill_map_beacon_attendee_count.ts
 *   DRY_RUN=1 npx tsx scripts/backfill_map_beacon_attendee_count.ts
 *
 * Updates only the new attendee_count column. Legacy COUNT(*) queries are unchanged.
 */

import { loadEnvFiles } from "./loadEnv";

loadEnvFiles();

import { createClient } from "@supabase/supabase-js";

const DRY_RUN = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";
const PAGE = Number.parseInt(process.env.BATCH_SIZE ?? "500", 10);

async function main(): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Run from click-web with .env.local.",
    );
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  const counts = new Map<string, number>();
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from("event_participation")
      .select("beacon_id, status")
      .in("status", ["rsvpd", "checked_in"])
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    if (rows.length === 0) break;
    for (const row of rows) {
      const id = typeof row.beacon_id === "string" ? row.beacon_id : null;
      if (!id) continue;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    offset += rows.length;
    if (rows.length < PAGE) break;
  }

  console.log("[attendee-count] beacons with rsvpd/checked_in", counts.size, { dryRun: DRY_RUN });

  if (DRY_RUN) {
    const sample = [...counts.entries()].slice(0, 10);
    console.log("[attendee-count] sample", sample);
    return;
  }

  let updated = 0;
  for (const [beaconId, cnt] of counts) {
    const { error } = await supabase.from("map_beacons").update({ attendee_count: cnt }).eq("id", beaconId);
    if (error) {
      console.error("[attendee-count] failed", beaconId, error.message);
      continue;
    }
    updated += 1;
  }

  console.log("[attendee-count] done", { updated });
}

main().catch((err: unknown) => {
  console.error("[attendee-count] fatal:", err instanceof Error ? err.message : err);
  process.exit(1);
});
