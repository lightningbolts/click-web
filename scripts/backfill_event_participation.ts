/**
 * One-time merge of beacon_attendees / event_bookmarks / event_check_ins into event_participation.
 *
 * Prerequisites:
 *   - Migration 20260824010000_event_time_and_participation.sql applied
 *   - NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in env
 *
 * Usage:
 *   cd click-web
 *   npx tsx scripts/backfill_event_participation.ts
 *   DRY_RUN=1 npx tsx scripts/backfill_event_participation.ts
 *
 * Never invents status interested or no_show.
 * Never writes guest RSVPs (event_guest_rsvps stays separate).
 * Never updates the three legacy tables.
 */

import { loadEnvFiles } from "./loadEnv";

loadEnvFiles();

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const DRY_RUN = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";
const FORCE = process.env.FORCE === "1" || process.env.FORCE === "true";
const PAGE = Number.parseInt(process.env.BATCH_SIZE ?? "500", 10);

type Status = "bookmarked" | "rsvpd" | "checked_in";

type Merged = {
  beacon_id: string;
  user_id: string;
  status: Status;
  bookmarked_at: string | null;
  rsvpd_at: string | null;
  checked_in_at: string | null;
  checked_out_at: string | null;
  source: string | null;
  platform: string | null;
  app_version: string | null;
  updated_at: string;
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

async function fetchAll<T extends Record<string, unknown>>(
  supabase: SupabaseClient,
  table: string,
  columns: string,
): Promise<T[]> {
  const out: T[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await supabase.from(table).select(columns).range(offset, offset + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE) break;
    offset += rows.length;
  }
  return out;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}

function maxIso(values: Array<string | null>): string {
  const parsed = values
    .filter((v): v is string => v != null)
    .map((v) => Date.parse(v))
    .filter((n) => Number.isFinite(n));
  if (parsed.length === 0) return new Date().toISOString();
  return new Date(Math.max(...parsed)).toISOString();
}

function pickTelemetry(
  preferred: { source?: unknown; platform?: unknown; app_version?: unknown } | undefined,
  fallbacks: Array<{ source?: unknown; platform?: unknown; app_version?: unknown } | undefined>,
): Pick<Merged, "source" | "platform" | "app_version"> {
  const chain = [preferred, ...fallbacks];
  for (const row of chain) {
    if (!row) continue;
    if (str(row.source) || str(row.platform) || str(row.app_version)) {
      return {
        source: str(row.source),
        platform: str(row.platform),
        app_version: str(row.app_version),
      };
    }
  }
  return { source: null, platform: null, app_version: null };
}

async function main(): Promise<void> {
  const supabase = adminClient();

  type Rsvp = {
    beacon_id: string;
    user_id: string;
    rsvpd_at?: string;
    created_at?: string;
    source?: string | null;
    platform?: string | null;
    app_version?: string | null;
  };
  type Bookmark = {
    beacon_id: string;
    user_id: string;
    created_at: string;
    source?: string | null;
    platform?: string | null;
    app_version?: string | null;
  };
  type CheckIn = {
    beacon_id: string;
    user_id: string;
    checked_in_at: string;
    checked_out_at: string | null;
    source?: string | null;
    platform?: string | null;
    app_version?: string | null;
  };

  const [rsvps, bookmarks, checkIns, existing] = await Promise.all([
    fetchAll<Rsvp>(
      supabase,
      "beacon_attendees",
      "beacon_id, user_id, rsvpd_at, created_at, source, platform, app_version",
    ),
    fetchAll<Bookmark>(
      supabase,
      "event_bookmarks",
      "beacon_id, user_id, created_at, source, platform, app_version",
    ),
    fetchAll<CheckIn>(
      supabase,
      "event_check_ins",
      "beacon_id, user_id, checked_in_at, checked_out_at, source, platform, app_version",
    ),
    fetchAll<{ beacon_id: string; user_id: string }>(supabase, "event_participation", "beacon_id, user_id"),
  ]);

  const existingKeys = new Set(existing.map((r) => `${r.beacon_id}:${r.user_id}`));
  const merged = new Map<string, Merged>();

  const ensure = (beaconId: string, userId: string): Merged => {
    const key = `${beaconId}:${userId}`;
    let row = merged.get(key);
    if (!row) {
      row = {
        beacon_id: beaconId,
        user_id: userId,
        status: "bookmarked",
        bookmarked_at: null,
        rsvpd_at: null,
        checked_in_at: null,
        checked_out_at: null,
        source: null,
        platform: null,
        app_version: null,
        updated_at: new Date().toISOString(),
      };
      merged.set(key, row);
    }
    return row;
  };

  const bookmarkByKey = new Map<string, Bookmark>();
  for (const b of bookmarks) {
    bookmarkByKey.set(`${b.beacon_id}:${b.user_id}`, b);
    const row = ensure(b.beacon_id, b.user_id);
    row.bookmarked_at = b.created_at;
    row.status = "bookmarked";
  }

  const rsvpByKey = new Map<string, Rsvp>();
  for (const r of rsvps) {
    rsvpByKey.set(`${r.beacon_id}:${r.user_id}`, r);
    const row = ensure(r.beacon_id, r.user_id);
    row.rsvpd_at = r.rsvpd_at ?? r.created_at ?? null;
    row.status = "rsvpd";
  }

  const checkInByKey = new Map<string, CheckIn>();
  for (const c of checkIns) {
    checkInByKey.set(`${c.beacon_id}:${c.user_id}`, c);
    const row = ensure(c.beacon_id, c.user_id);
    row.checked_in_at = c.checked_in_at;
    row.checked_out_at = c.checked_out_at;
    row.status = "checked_in";
  }

  const payloads: Merged[] = [];
  let skippedExisting = 0;
  for (const [key, row] of merged) {
    if (!FORCE && existingKeys.has(key)) {
      skippedExisting += 1;
      continue;
    }
    const tel = pickTelemetry(checkInByKey.get(key), [rsvpByKey.get(key), bookmarkByKey.get(key)]);
    row.source = tel.source;
    row.platform = tel.platform;
    row.app_version = tel.app_version;
    row.updated_at = maxIso([row.bookmarked_at, row.rsvpd_at, row.checked_in_at, row.checked_out_at]);
    payloads.push(row);
  }

  const distinctLegacy = merged.size;
  console.log("[participation] merge", {
    rsvps: rsvps.length,
    bookmarks: bookmarks.length,
    checkIns: checkIns.length,
    distinctLegacy,
    alreadyInTarget: existing.length,
    toUpsert: payloads.length,
    skippedExisting,
    dryRun: DRY_RUN,
    force: FORCE,
  });

  if (DRY_RUN) {
    console.log("[participation] sample", payloads.slice(0, 5));
    return;
  }

  const chunk = 100;
  let upserted = 0;
  for (let i = 0; i < payloads.length; i += chunk) {
    const slice = payloads.slice(i, i + chunk);
    const { error } = await supabase.from("event_participation").upsert(slice, {
      onConflict: "beacon_id,user_id",
    });
    if (error) throw new Error(error.message);
    upserted += slice.length;
  }

  const { count: targetCount } = await supabase
    .from("event_participation")
    .select("id", { count: "exact", head: true });

  console.log("[participation] done", {
    upserted,
    targetCount,
    expectedDistinct: distinctLegacy,
  });
}

main().catch((err: unknown) => {
  console.error("[participation] fatal:", err instanceof Error ? err.message : err);
  process.exit(1);
});
