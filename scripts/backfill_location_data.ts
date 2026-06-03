import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { loadEnvFiles } from './loadEnv';

loadEnvFiles();

const NOMINATIM_USER_AGENT = 'ClickPlatformsApp/1.0 (contact@click.com)';
const NOMINATIM_REVERSE_TIMEOUT_MS = 3_500;
const NOMINATIM_DELAY_MS = 1_500;
const DISPLAY_LOCATION_FALLBACK = 'A new city';
const BATCH_SIZE = 200;

type EncounterBackfillRow = {
  id: string;
  gps_lat: number | null;
  gps_lon: number | null;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function toFiniteNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function firstNonEmptyString(values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

function extractDisplayLocation(semanticLocation: Record<string, unknown>): string {
  const address = isRecord(semanticLocation.address) ? semanticLocation.address : null;
  if (!address) return DISPLAY_LOCATION_FALLBACK;
  const city = firstNonEmptyString([
    address.city,
    address.town,
    address.village,
    address.hamlet,
  ]);
  if (!city) return DISPLAY_LOCATION_FALLBACK;
  const state = firstNonEmptyString([address.state]);
  return state ? `${city}, ${state}` : city;
}

async function fetchNominatimReverseGeocode(lat: number, lon: number): Promise<{
  semanticLocation: Record<string, unknown> | null;
  displayLocation: string;
}> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NOMINATIM_REVERSE_TIMEOUT_MS);
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`;
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': NOMINATIM_USER_AGENT,
      },
    });
    if (!response.ok) {
      return { semanticLocation: null, displayLocation: DISPLAY_LOCATION_FALLBACK };
    }
    const payload = (await response.json()) as unknown;
    if (!isRecord(payload)) {
      return { semanticLocation: null, displayLocation: DISPLAY_LOCATION_FALLBACK };
    }
    return {
      semanticLocation: payload,
      displayLocation: extractDisplayLocation(payload),
    };
  } catch {
    return { semanticLocation: null, displayLocation: DISPLAY_LOCATION_FALLBACK };
  } finally {
    clearTimeout(timer);
  }
}

async function loadBatch(
  supabase: SupabaseClient,
  lastProcessedId: string | null,
): Promise<EncounterBackfillRow[]> {
  let query = supabase
    .from('connection_encounters')
    .select('id, gps_lat, gps_lon')
    .is('semantic_location', null)
    .not('gps_lat', 'is', null)
    .order('id', { ascending: true })
    .limit(BATCH_SIZE);

  if (lastProcessedId) {
    query = query.gt('id', lastProcessedId);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to load pending rows: ${error.message}`);
  }

  return (data ?? []) as EncounterBackfillRow[];
}

async function main(): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  let processed = 0;
  let updated = 0;
  let failed = 0;
  let lastProcessedId: string | null = null;

  while (true) {
    const batch = await loadBatch(supabase, lastProcessedId);
    if (batch.length === 0) {
      break;
    }

    for (const row of batch) {
      try {
        let semanticLocation: Record<string, unknown> | null = null;
        let displayLocation = DISPLAY_LOCATION_FALLBACK;

        const lat = toFiniteNumber(row.gps_lat);
        const lon = toFiniteNumber(row.gps_lon);

        if (lat != null && lon != null) {
          const geocoded = await fetchNominatimReverseGeocode(lat, lon);
          semanticLocation = geocoded.semanticLocation;
          displayLocation = geocoded.displayLocation;
        }

        const { error: updateError } = await supabase
          .from('connection_encounters')
          .update({
            semantic_location: semanticLocation,
            display_location: displayLocation,
          })
          .eq('id', row.id);

        if (updateError) {
          failed += 1;
          console.error(`[backfill] update failed for ${row.id}: ${updateError.message}`);
        } else {
          updated += 1;
          console.log(`[backfill] updated ${row.id} -> ${displayLocation}`);
        }
      } catch (error) {
        failed += 1;
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[backfill] unexpected error for ${row.id}: ${message}`);
      } finally {
        processed += 1;
        lastProcessedId = row.id;
        await new Promise((resolve) => setTimeout(resolve, NOMINATIM_DELAY_MS));
      }
    }
  }

  console.log(`[backfill] done. processed=${processed} updated=${updated} failed=${failed}`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[backfill] fatal: ${message}`);
  process.exit(1);
});
