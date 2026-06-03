import type { SupabaseClient } from '@supabase/supabase-js';
import { runEventEnrichmentPipeline, type EnrichmentInput } from '@/lib/enrichment/enrichmentPipeline';
import { runVibeEnrichmentPipeline } from '@/lib/enrichment/vibeEnrichmentPipeline';
import type { EnrichmentPipelineResult } from '@/types/enrichment-schema';
import type { VibeEnrichmentResult } from '@/lib/enrichment/vibeEnrichmentPipeline';

export type EncounterEnrichmentResult = {
  event: EnrichmentPipelineResult;
  vibe: VibeEnrichmentResult;
};

/**
 * Runs event registry resolution and structural vibe classification concurrently.
 * Neither path blocks the other; both are safe to fire-and-forget.
 */
export async function runEncounterEnrichment(
  supabase: SupabaseClient,
  input: EnrichmentInput,
): Promise<EncounterEnrichmentResult> {
  const [event, vibe] = await Promise.all([
    runEventEnrichmentPipeline(supabase, input),
    runVibeEnrichmentPipeline(supabase, { encounter_id: input.encounter_id }),
  ]);
  return { event, vibe };
}
