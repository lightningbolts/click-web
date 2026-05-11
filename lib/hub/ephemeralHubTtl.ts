const TWENTY_FOUR_H_MS = 24 * 60 * 60 * 1000;

export type HubExpiryComputation = {
  /** ISO-8601 UTC timestamp when the hub stops accepting traffic. */
  expires_at_iso: string;
  /** Same instant as epoch milliseconds (server clock). */
  expires_at_ms: number;
  ttl_ms: number;
};

/**
 * Server-side TTL for ephemeral hubs (thin client must not compute this).
 */
export function computeEphemeralHubExpiry(nowMs: number = Date.now()): HubExpiryComputation {
  const expiresAtMs = nowMs + TWENTY_FOUR_H_MS;
  return {
    expires_at_iso: new Date(expiresAtMs).toISOString(),
    expires_at_ms: expiresAtMs,
    ttl_ms: TWENTY_FOUR_H_MS,
  };
}
