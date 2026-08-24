/**
 * Backfill map_beacons.starts_at / ends_at / event_timezone from metadata jsonb.
 *
 * Prerequisites:
 *   - Migration 20260824010000_event_time_and_participation.sql applied
 *   - NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in env
 *
 * Usage:
 *   cd click-web
 *   npx tsx scripts/backfill_map_beacon_event_times.ts
 *   DRY_RUN=1 npx tsx scripts/backfill_map_beacon_event_times.ts
 *   FORCE=1 npx tsx scripts/backfill_map_beacon_event_times.ts   # overwrite existing new-column values
 *
 * Env:
 *   BATCH_SIZE  default 100
 *   DRY_RUN=1   log candidates; no writes
 *   FORCE=1     write even when starts_at/ends_at/event_timezone already set
 *   LIMIT=N     stop after N candidate rows
 *
 * Only the new columns are updated. metadata jsonb is never rewritten.
 */

import { loadEnvFiles } from "./loadEnv";

loadEnvFiles();

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  eventEndAtFromMetadata,
  eventStartAtFromMetadata,
  eventTimezoneFromMetadata,
  parseBeaconMetadata,
} from "../lib/events/eventMetadata";

const BATCH_SIZE = Number.parseInt(process.env.BATCH_SIZE ?? "100", 10);
const DRY_RUN = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";
const FORCE = process.env.FORCE === "1" || process.env.FORCE === "true";
const LIMIT = process.env.LIMIT ? Number.parseInt(process.env.LIMIT, 10) : null;

type BeaconRow = {
  id: string;
  metadata: unknown;
  starts_at: string | null;
  ends_at: string | null;
  event_timezone: string | null;
};

function adminClient(): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Run from click-web with .env.local.",
    );
  }
  return createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
}

function patchForRow(row: BeaconRow): {
  starts_at?: string;
  ends_at?: string;
  event_timezone?: string;
} | null {
  const meta = parseBeaconMetadata(row.metadata);
  const start = eventStartAtFromMetadata(meta);
  const end = eventEndAtFromMetadata(meta);
  const tz = eventTimezoneFromMetadata(meta);

  const patch: { starts_at?: string; ends_at?: string; event_timezone?: string } = {};
  if (start && (FORCE || row.starts_at == null)) patch.starts_at = start;
  if (end && (FORCE || row.ends_at == null)) patch.ends_at = end;
  if (tz && (FORCE || row.event_timezone == null)) patch.event_timezone = tz;

  return Object.keys(patch).length > 0 ? patch : null;
}

async function main(): Promise<void> {
  const supabase = adminClient();
  let offset = 0;
  let scanned = 0;
  let updated = 0;
  let skipped = 0;

  console.log("[beacon-times] starting", { dryRun: DRY_RUN, force: FORCE, batchSize: BATCH_SIZE, limit: LIMIT });

  while (true) {
    if (LIMIT != null && scanned >= LIMIT) break;

    const { data, error } = await supabase
      .from("map_beacons")
      .select("id, metadata, starts_at, ends_at, event_timezone")
      .order("id", { ascending: true })
      .range(offset, offset + BATCH_SIZE - 1);

    if (error) throw new Error(error.message);
    const rows = (data ?? []) as BeaconRow[];
    if (rows.length === 0) break;

    for (const row of rows) {
      if (LIMIT != null && scanned >= LIMIT) break;
      scanned += 1;
      const patch = patchForRow(row);
      if (patch == null) {
        skipped += 1;
        continue;
      }
      if (DRY_RUN) {
        console.log("[beacon-times] would update", row.id, patch);
        updated += 1;
        continue;
      }
      const { error: updErr } = await supabase.from("map_beacons").update(patch).eq("id", row.id);
      if (updErr) {
        console.error("[beacon-times] update failed", row.id, updErr.message);
        continue;
      }
      updated += 1;
    }

    offset += rows.length;
    if (rows.length < BATCH_SIZE) break;
  }

  const { count: withStart } = await supabase
    .from("map_beacons")
    .select("id", { count: "exact", head: true })
    .not("starts_at", "is", null);

  console.log("[beacon-times] done", {
    scanned,
    updated,
    skipped,
    liveStartsAtNotNull: withStart ?? null,
    dryRun: DRY_RUN,
  });
}

main().catch((err: unknown) => {
  console.error("[beacon-times] fatal:", err instanceof Error ? err.message : err);
  process.exit(1);
});
