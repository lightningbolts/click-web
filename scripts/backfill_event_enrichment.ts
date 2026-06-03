/**
 * Backfill event enrichment for existing connection_encounters rows.
 *
 * Prerequisites:
 *   - Migration 20260602120000_event_enrichment_knowledge_graph.sql applied
 *   - NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in env
 *   - Optional: TICKETMASTER_API_KEY for event resolution
 *
 * Usage:
 *   cd click-web
 *   npx tsx scripts/backfill_event_enrichment.ts              # live run
 *   DRY_RUN=1 npx tsx scripts/backfill_event_enrichment.ts    # list rows only (no API calls)
 *   PREVIEW=1 LIMIT=5 npx tsx scripts/backfill_event_enrichment.ts  # show would-write payloads
 *
 * Env:
 *   BATCH_SIZE            default 50
 *   ENRICHMENT_DELAY_MS   default 1500 — pause between rows (Overpass/TM rate limits)
 *   DRY_RUN=1             list candidate rows; no external APIs, no DB writes
 *   PREVIEW=1             resolve venues/events via APIs; log upsert payloads; no DB writes
 *   FORCE=1               include rows that already have event_id
 *   LIMIT=N               stop after N rows (for testing)
 */

import { loadEnvFiles } from './loadEnv';

loadEnvFiles();

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  previewEventEnrichmentPipeline,
  runEventEnrichmentPipeline,
} from '../lib/enrichment/enrichmentPipeline';
import type { EnrichmentPipelineResult, EnrichmentPreviewResult } from '../types/enrichment-schema';
import { gridCoords } from '../lib/enrichment/gridCoords';

const BATCH_SIZE = Number.parseInt(process.env.BATCH_SIZE ?? '50', 10);
const DELAY_MS = Number.parseInt(process.env.ENRICHMENT_DELAY_MS ?? '1500', 10);
const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';
const PREVIEW = process.env.PREVIEW === '1' || process.env.PREVIEW === 'true';
const FORCE = process.env.FORCE === '1' || process.env.FORCE === 'true';
const LIMIT = process.env.LIMIT ? Number.parseInt(process.env.LIMIT, 10) : null;

type EncounterRow = {
  id: string;
  gps_lat: number | null;
  gps_lon: number | null;
  encountered_at: string;
  event_id: string | null;
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loadBatch(
  supabase: SupabaseClient,
  lastProcessedId: string | null,
): Promise<EncounterRow[]> {
  let query = supabase
    .from('connection_encounters')
    .select('id, gps_lat, gps_lon, encountered_at, event_id')
    .not('gps_lat', 'is', null)
    .not('gps_lon', 'is', null)
    .order('id', { ascending: true })
    .limit(BATCH_SIZE);

  if (!FORCE) {
    query = query.is('event_id', null);
  }

  if (lastProcessedId) {
    query = query.gt('id', lastProcessedId);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to load batch: ${error.message}`);
  }

  return (data ?? []) as EncounterRow[];
}

function tally(
  counts: Record<string, number>,
  result: EnrichmentPipelineResult,
): void {
  counts[result.status] = (counts[result.status] ?? 0) + 1;
  if (result.degraded) {
    counts.degraded = (counts.degraded ?? 0) + 1;
  }
  if (result.event_id) {
    counts.linked = (counts.linked ?? 0) + 1;
  }
}

function formatPreviewLine(preview: EnrichmentPreviewResult): string {
  const parts = [
    `status=${preview.status}`,
    `date=${preview.event_date}`,
    `grid=${preview.grid.lat},${preview.grid.lon}`,
  ];
  const w = preview.would_write;
  if (w.event_venues_cache) {
    parts.push(`venue_cache="${w.event_venues_cache.venue_name}"`);
  }
  if (w.events_registry) {
    parts.push(
      `registry={id:"${w.events_registry.id}", category:"${w.events_registry.category}", title:"${w.events_registry.title}"}`,
    );
  }
  if (w.connection_encounters) {
    parts.push(`encounter.event_id="${w.connection_encounters.event_id}"`);
  }
  if (preview.existing.venue_cache_hit) parts.push('venue_from_db_cache');
  if (preview.existing.registry_hit) parts.push('event_from_db_cache');
  if (preview.degraded) parts.push('degraded');
  return parts.join(' | ');
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

  console.log('[event-backfill] starting', {
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
  const uniqueGridCells = new Set<string>();

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
        console.log(`[event-backfill] skip ${row.id} (invalid gps)`);
        continue;
      }
      const { lat, lon } = coords;
      const grid = gridCoords(lat, lon);
      uniqueGridCells.add(`${grid.lat},${grid.lon}`);

      if (DRY_RUN && !PREVIEW) {
        console.log(
          `[event-backfill] dry-run ${row.id} @ ${lat},${lon} grid=${grid.lat},${grid.lon} date=${row.encountered_at.slice(0, 10)}`,
        );
        processed += 1;
        continue;
      }

      if (PREVIEW) {
        try {
          const preview = await previewEventEnrichmentPipeline(supabase, {
            encounter_id: row.id,
            lat,
            lon,
            timestamp: row.encountered_at,
          });
          statusCounts[preview.status] = (statusCounts[preview.status] ?? 0) + 1;
          if (preview.degraded) statusCounts.degraded = (statusCounts.degraded ?? 0) + 1;
          if (preview.would_write.connection_encounters) {
            statusCounts.linked = (statusCounts.linked ?? 0) + 1;
          }
          console.log(`[event-backfill] preview ${row.id} | ${formatPreviewLine(preview)}`);
          console.log('[event-backfill] preview payload:', JSON.stringify(preview.would_write, null, 2));
        } catch (err) {
          statusCounts.error = (statusCounts.error ?? 0) + 1;
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[event-backfill] preview error ${row.id}: ${msg}`);
        }
        processed += 1;
        if (DELAY_MS > 0) await sleep(DELAY_MS);
        continue;
      }

      try {
        const result = await runEventEnrichmentPipeline(supabase, {
          encounter_id: row.id,
          lat,
          lon,
          timestamp: row.encountered_at,
        });

        tally(statusCounts, result);
        processed += 1;

        console.log(
          `[event-backfill] ${row.id} -> status=${result.status} event_id=${result.event_id ?? 'null'} venue=${result.venue_name ?? 'null'}`,
        );
      } catch (err) {
        statusCounts.error = (statusCounts.error ?? 0) + 1;
        processed += 1;
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[event-backfill] error ${row.id}: ${msg}`);
      }

      if (DELAY_MS > 0) {
        await sleep(DELAY_MS);
      }
    }
  }

  console.log('[event-backfill] done', {
    processed,
    skipped,
    uniqueGridCells: uniqueGridCells.size,
    statusCounts,
  });
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`[event-backfill] fatal: ${msg}`);
  process.exit(1);
});
