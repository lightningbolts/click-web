import 'server-only';

import { createAdminSupabaseClient } from '@/lib/server/admin/supabaseAdmin';
import { runEventEnrichmentPipeline } from '@/lib/enrichment/enrichmentPipeline';

export type ScheduleEventEnrichmentInput = {
  encounter_id: string;
  lat: number;
  lon: number;
  timestamp: string;
};

/**
 * Fire-and-forget event enrichment — never awaited by proximity bind paths.
 */
export function scheduleEventEnrichment(input: ScheduleEventEnrichmentInput): void {
  if (
    !Number.isFinite(input.lat) ||
    !Number.isFinite(input.lon) ||
    (input.lat === 0 && input.lon === 0)
  ) {
    return;
  }

  void (async () => {
    try {
      const supabase = createAdminSupabaseClient();
      await runEventEnrichmentPipeline(supabase, input);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('[enrichment] schedule failed:', msg);
    }
  })();
}
