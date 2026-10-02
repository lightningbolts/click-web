/**
 * F4 — alert (hazard) beacon confirmations. Pure decision logic; the route loads the beacon and
 * prior votes, and applies the outcome. Every number comes from `feature_flags.config`.
 */

export type AlertConfirmationStatus = 'still_here' | 'cleared';

export type AlertConfig = {
  ttlMinutes: number;
  radiusMeters: number;
  clearedThreshold: number;
  voteWindowMinutes: number;
  maxLifetimeHours: number;
};

export const DEFAULT_ALERT_CONFIG: AlertConfig = {
  ttlMinutes: 120,
  radiusMeters: 300,
  clearedThreshold: 2,
  voteWindowMinutes: 120,
  maxLifetimeHours: 24,
};

const ALERT_BEACON_TYPES = new Set(['hazard', 'hazard_utility']);

export function isAlertBeaconType(beaconType: unknown): boolean {
  return typeof beaconType === 'string' && ALERT_BEACON_TYPES.has(beaconType);
}

export type AlertVote = { userId: string; status: AlertConfirmationStatus; createdAtMs: number };

export type AlertDecision =
  | { outcome: 'rejected'; reason: 'expired' | 'location_required' | 'out_of_range' | 'already_voted' }
  | { outcome: 'extended'; expiresAtMs: number }
  | { outcome: 'cleared' }
  | { outcome: 'recorded' };

export function decideAlertConfirmation(input: {
  creatorId: string;
  createdAtMs: number;
  expiresAtMs: number;
  voterId: string;
  status: AlertConfirmationStatus;
  /** Voter's distance from the pin; null when they sent no location. */
  distanceMeters: number | null;
  /** Votes on this beacon, any order. */
  votes: AlertVote[];
  nowMs: number;
  config: AlertConfig;
}): AlertDecision {
  const { config, nowMs } = input;
  if (!(input.expiresAtMs > nowMs)) return { outcome: 'rejected', reason: 'expired' };

  // The creator can take their own alert down from anywhere, at any time.
  if (input.status === 'cleared' && input.voterId === input.creatorId) return { outcome: 'cleared' };

  if (input.distanceMeters == null) return { outcome: 'rejected', reason: 'location_required' };
  if (input.distanceMeters > config.radiusMeters) return { outcome: 'rejected', reason: 'out_of_range' };

  const windowStart = nowMs - config.voteWindowMinutes * 60_000;
  const recent = input.votes.filter((v) => v.createdAtMs > windowStart);
  if (recent.some((v) => v.userId === input.voterId)) return { outcome: 'rejected', reason: 'already_voted' };

  if (input.status === 'still_here') {
    const ceiling = input.createdAtMs + config.maxLifetimeHours * 3_600_000;
    const extended = Math.min(Math.max(input.expiresAtMs, nowMs + config.ttlMinutes * 60_000), ceiling);
    return { outcome: 'extended', expiresAtMs: Math.max(extended, input.expiresAtMs) };
  }

  // Cleared: distinct voters since the latest "still here" (a fresh sighting resets the count).
  const lastSighting = Math.max(
    windowStart,
    ...recent.filter((v) => v.status === 'still_here').map((v) => v.createdAtMs),
  );
  const clearers = new Set(
    recent.filter((v) => v.status === 'cleared' && v.createdAtMs > lastSighting).map((v) => v.userId),
  );
  clearers.add(input.voterId);
  return clearers.size >= config.clearedThreshold ? { outcome: 'cleared' } : { outcome: 'recorded' };
}
