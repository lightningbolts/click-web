import 'server-only';

import { createAdminSupabaseClient } from '@/lib/server/admin/supabaseAdmin';
import { runEncounterEnrichment } from '@/lib/enrichment/runEncounterEnrichment';

export type ScheduleEventEnrichmentInput = {
  encounter_id: string;
  lat: number;
  lon: number;
  timestamp: string;
};

/**
 * Fire-and-forget encounter enrichment (events + structural vibe classification).
 * Never awaited by proximity bind paths.
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
      await runEncounterEnrichment(supabase, input);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('[enrichment] schedule failed:', msg);
    }
  })();
}
