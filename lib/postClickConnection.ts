'use client';

import { notifyEncounterCooldownIfRateLimited } from '@/lib/encounterCooldownToast';

type PostClickConnectionResult = {
  ok: boolean;
  status: number;
  payload: Record<string, unknown>;
  /** True when the server rate-limited a new encounter row (3h guard). */
  rateLimitedEncounter: boolean;
};

/**
 * Creates a connection via `POST /api/connections` and surfaces encounter cooldown UX when applicable.
 * Use this (or mirror its logic) from QR / proximity flows on the web dashboard.
 */
export async function postClickConnection(
  getAuthHeaders: () => Promise<HeadersInit>,
  body: Record<string, unknown>,
): Promise<PostClickConnectionResult> {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/connections', {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  let rateLimitedEncounter = false;
  if (res.ok && payload.success === true) {
    rateLimitedEncounter = notifyEncounterCooldownIfRateLimited({
      encounter_logged:
        typeof payload.encounter_logged === 'boolean' ? payload.encounter_logged : undefined,
      reason: typeof payload.reason === 'string' ? payload.reason : undefined,
    });
  }
  return {
    ok: res.ok,
    status: res.status,
    payload,
    rateLimitedEncounter,
  };
}
