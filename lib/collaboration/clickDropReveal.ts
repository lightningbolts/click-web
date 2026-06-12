/** Reveal TTL for Click Drops: 24 hours after the user sends the photo. */
export function computeClickDropRevealTtlIso(nowMs: number = Date.now()): string {
  return new Date(nowMs + 24 * 60 * 60 * 1000).toISOString();
}
