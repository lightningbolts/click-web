/**
 * Backfill structural vibe classification on connection_encounters.vibe_capture.
 * Pure math + row telemetry — no external APIs, safe to run fast.
 *
 * Prerequisites:
 *   - NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in env
 *
 * Usage:
 *   cd click-web
 *   npx tsx scripts/backfill_vibe_enrichment.ts
 *   DRY_RUN=1 npx tsx scripts/backfill_vibe_enrichment.ts
 *   PREVIEW=1 LIMIT=10 npx tsx scripts/backfill_vibe_enrichment.ts
 *
 * Env:
 *   BATCH_SIZE          default 100
 *   DELAY_MS            default 0 — optional throttle between rows
 *   DRY_RUN=1           list candidates only
 *   PREVIEW=1           classify and log payloads; no DB writes
 *   FORCE=1             re-classify rows that already have archetype in vibe_capture
 *   LIMIT=N             stop after N rows
 */

import { loadEnvFiles } from './loadEnv';

loadEnvFiles();

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { classifyEncounterVibe } from '../lib/enrichment/vibeClassification';
import { runVibeEnrichmentPipeline } from '../lib/enrichment/vibeEnrichmentPipeline';
import type { VibeCaptureSchema } from '../lib/enrichment/vibeCaptureSchema';
import type { VibeEnrichmentResult } from '../lib/enrichment/vibeEnrichmentPipeline';

const BATCH_SIZE = Number.parseInt(process.env.BATCH_SIZE ?? '100', 10);
const DELAY_MS = Number.parseInt(process.env.DELAY_MS ?? '0', 10);
const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';
const PREVIEW = process.env.PREVIEW === '1' || process.env.PREVIEW === 'true';
const FORCE = process.env.FORCE === '1' || process.env.FORCE === 'true';
const LIMIT = process.env.LIMIT ? Number.parseInt(process.env.LIMIT, 10) : null;

type EncounterRow = {
  id: string;
  gps_lat: number | null;
  gps_lon: number | null;
  encountered_at: string;
  semantic_location: unknown;
  elevation_category: string | null;
  lux_level: number | null;
  exact_barometric_elevation_m: number | null;
  noise_level: string | null;
  exact_noise_level_db: number | null;
  vibe_capture: Record<string, unknown> | null;
};

function parseGps(
  lat: number | null,
  lon: number | null,
): { lat: number; lon: number } | null {
  if (lat == null || lon == null || !Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }
  if (lat === 0 && lon === 0) return null;
  return { lat, lon };
}

function hasStructuralVibe(vibeCapture: Record<string, unknown> | null): boolean {
  if (!vibeCapture || typeof vibeCapture !== 'object') return false;
  const archetype = vibeCapture.archetype;
  return typeof archetype === 'string' && archetype.trim().length > 0;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loadBatch(
  supabase: SupabaseClient,
  lastProcessedId: string | null,
): Promise<EncounterRow[]> {
  let query = supabase
    .from('connection_encounters')
    .select(
      'id, gps_lat, gps_lon, encountered_at, semantic_location, elevation_category, lux_level, exact_barometric_elevation_m, noise_level, exact_noise_level_db, vibe_capture',
    )
    .not('gps_lat', 'is', null)
    .not('gps_lon', 'is', null)
    .order('id', { ascending: true })
    .limit(BATCH_SIZE);

  if (lastProcessedId) {
    query = query.gt('id', lastProcessedId);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to load batch: ${error.message}`);
  }

  const rows = (data ?? []) as EncounterRow[];
  if (FORCE) return rows;
  return rows.filter((row) => !hasStructuralVibe(row.vibe_capture));
}

function formatVibeLine(vibe: VibeCaptureSchema): string {
  return [
    `archetype="${vibe.archetype}"`,
    `temporal=${vibe.temporal_block}`,
    `solar=${vibe.solar_state}`,
    `academic=${vibe.academic_era}`,
    `term="${vibe.academic_term}"`,
    `zoning="${vibe.zoning_profile}"`,
    `space={indoor:${vibe.space_probability.indoor},elevated:${vibe.space_probability.elevated}}`,
  ].join(' | ');
}

function tally(counts: Record<string, number>, result: VibeEnrichmentResult): void {
  counts[result.status] = (counts[result.status] ?? 0) + 1;
}

async function main(): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    const root = process.cwd();
    throw new Error(
      [
        'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.',
        `Looked for .env.local and .env in: ${root}`,
        'Run from the click-web directory, or export the vars in your shell.',
      ].join(' '),
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  console.log('[vibe-backfill] starting', {
    dryRun: DRY_RUN,
    preview: PREVIEW,
    force: FORCE,
    batchSize: BATCH_SIZE,
    delayMs: DELAY_MS,
    limit: LIMIT,
  });

  let processed = 0;
  let skipped = 0;
  let lastProcessedId: string | null = null;
  const statusCounts: Record<string, number> = {};

  while (true) {
    if (LIMIT != null && processed >= LIMIT) {
      break;
    }

    const batch = await loadBatch(supabase, lastProcessedId);
    if (batch.length === 0) {
      break;
    }

    for (const row of batch) {
      if (LIMIT != null && processed >= LIMIT) {
        break;
      }

      lastProcessedId = row.id;

      const coords = parseGps(row.gps_lat, row.gps_lon);
      if (!coords) {
        skipped += 1;
        console.log(`[vibe-backfill] skip ${row.id} (invalid gps)`);
        continue;
      }

      if (DRY_RUN && !PREVIEW) {
        console.log(
          `[vibe-backfill] dry-run ${row.id} @ ${coords.lat},${coords.lon} at=${row.encountered_at}`,
        );
        processed += 1;
        continue;
      }

      if (PREVIEW) {
        const classification = classifyEncounterVibe({
          encountered_at: row.encountered_at,
          lat: coords.lat,
          lon: coords.lon,
          semantic_location: row.semantic_location,
          elevation_category: row.elevation_category,
          lux_level: row.lux_level,
          exact_barometric_elevation_m: row.exact_barometric_elevation_m,
          noise_level: row.noise_level,
          exact_noise_level_db: row.exact_noise_level_db,
        });
        if (!classification) {
          statusCounts.skipped = (statusCounts.skipped ?? 0) + 1;
          console.log(`[vibe-backfill] preview ${row.id} | classification_failed`);
        } else {
          statusCounts.preview = (statusCounts.preview ?? 0) + 1;
          console.log(`[vibe-backfill] preview ${row.id} | ${formatVibeLine(classification)}`);
          console.log('[vibe-backfill] preview payload:', JSON.stringify(classification, null, 2));
        }
        processed += 1;
        if (DELAY_MS > 0) await sleep(DELAY_MS);
        continue;
      }

      try {
        const result = await runVibeEnrichmentPipeline(supabase, { encounter_id: row.id });
        tally(statusCounts, result);
        processed += 1;

        const archetype =
          result.vibe_capture?.archetype ??
          (result.status === 'classified' ? '(written)' : '—');
        console.log(
          `[vibe-backfill] ${row.id} -> status=${result.status} archetype=${archetype}${result.reason ? ` reason=${result.reason}` : ''}`,
        );
      } catch (err) {
        statusCounts.error = (statusCounts.error ?? 0) + 1;
        processed += 1;
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[vibe-backfill] error ${row.id}: ${msg}`);
      }

      if (DELAY_MS > 0) {
        await sleep(DELAY_MS);
      }
    }

    if (batch.length < BATCH_SIZE) {
      break;
    }
  }

  console.log('[vibe-backfill] done', { processed, skipped, statusCounts });
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`[vibe-backfill] fatal: ${msg}`);
  process.exit(1);
});
