'use client';

import { toast } from 'sonner';

export const ENCOUNTER_COOLDOWN_TOAST_MESSAGE =
  'You recently crossed paths with this person! Wait a bit before logging another memory.';

/**
 * Call after a successful `POST /api/connections` (or equivalent) when the JSON body may include
 * `encounter_logged` / `reason` from the 3h `connection_encounters` guard.
 *
 * @returns true when a cooldown toast was shown (caller should skip opening a context-tagging modal).
 */
export function notifyEncounterCooldownIfRateLimited(payload: {
  encounter_logged?: boolean;
  reason?: string | null;
}): boolean {
  if (payload.encounter_logged !== false) return false;
  if (payload.reason !== 'rate_limit_active') return false;
  toast.message(ENCOUNTER_COOLDOWN_TOAST_MESSAGE);
  return true;
}
