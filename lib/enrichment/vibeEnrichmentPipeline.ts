import type { SupabaseClient } from '@supabase/supabase-js';
import { classifyEncounterVibe } from '@/lib/enrichment/vibeClassification';
import type { VibeCaptureSchema } from '@/lib/enrichment/vibeCaptureSchema';

const STRUCTURAL_KEYS: (keyof VibeCaptureSchema)[] = [
  'solar_state',
  'temporal_block',
  'academic_era',
  'academic_term',
  'zoning_profile',
  'space_probability',
  'archetype',
  'classified_at',
  'neighbourhood',
  'suburb',
];

export type VibeEnrichmentInput = {
  encounter_id: string;
};

export type VibeEnrichmentResult = {
  encounter_id: string;
  status: 'classified' | 'skipped' | 'failed';
  vibe_capture?: VibeCaptureSchema;
  reason?: string;
};

type EncounterTelemetryRow = {
  id: string;
  encountered_at: string | null;
  gps_lat: number | null;
  gps_lon: number | null;
  semantic_location: unknown;
  elevation_category: string | null;
  lux_level: number | null;
  exact_barometric_elevation_m: number | null;
  relative_altitude_m: number | null;
  noise_level: string | null;
  exact_noise_level_db: number | null;
  vibe_capture: Record<string, unknown> | null;
};

function mergeVibeCapture(
  existing: Record<string, unknown> | null,
  structural: VibeCaptureSchema,
): Record<string, unknown> {
  const base = existing && typeof existing === 'object' ? { ...existing } : {};
  for (const key of STRUCTURAL_KEYS) {
    const value = structural[key];
    if (value !== undefined) {
      base[key] = value;
    }
  }
  return base;
}

/**
 * Loads encounter telemetry, runs structural classification, persists to `vibe_capture`.
 * Never throws — safe for fire-and-forget background execution.
 */
export async function runVibeEnrichmentPipeline(
  supabase: SupabaseClient,
  input: VibeEnrichmentInput,
): Promise<VibeEnrichmentResult> {
  const { encounter_id } = input;

  const { data: row, error } = await supabase
    .from('connection_encounters')
    .select(
      'id, encountered_at, gps_lat, gps_lon, semantic_location, elevation_category, lux_level, exact_barometric_elevation_m, relative_altitude_m, noise_level, exact_noise_level_db, vibe_capture',
    )
    .eq('id', encounter_id)
    .maybeSingle();

  if (error) {
    console.warn('[vibe-enrichment] fetch failed:', error.message);
    return { encounter_id, status: 'failed', reason: error.message };
  }

  const enc = row as EncounterTelemetryRow | null;
  if (!enc) {
    return { encounter_id, status: 'skipped', reason: 'encounter_not_found' };
  }

  const lat = enc.gps_lat;
  const lon = enc.gps_lon;
  const encountered_at = enc.encountered_at ?? new Date().toISOString();

  if (
    typeof lat !== 'number' ||
    typeof lon !== 'number' ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    (lat === 0 && lon === 0)
  ) {
    return { encounter_id, status: 'skipped', reason: 'missing_gps' };
  }

  const classification = classifyEncounterVibe({
    encountered_at,
    lat,
    lon,
    semantic_location: enc.semantic_location,
    elevation_category: enc.elevation_category,
    lux_level: enc.lux_level,
    exact_barometric_elevation_m: enc.exact_barometric_elevation_m,
    relative_altitude_m: enc.relative_altitude_m,
    noise_level: enc.noise_level,
    exact_noise_level_db: enc.exact_noise_level_db,
  });

  if (!classification) {
    return { encounter_id, status: 'skipped', reason: 'classification_failed' };
  }

  const merged = mergeVibeCapture(enc.vibe_capture, classification);

  const { error: updateErr } = await supabase
    .from('connection_encounters')
    .update({ vibe_capture: merged })
    .eq('id', encounter_id);

  if (updateErr) {
    console.warn('[vibe-enrichment] update failed:', updateErr.message);
    return { encounter_id, status: 'failed', reason: updateErr.message };
  }

  return {
    encounter_id,
    status: 'classified',
    vibe_capture: classification,
  };
}
