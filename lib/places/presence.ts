/**
 * Presence for Pulse (§4.4): the strongest of an active Place check-in, an open check-in at a
 * live official event here, or a verified handshake here. The caller pre-filters each input to
 * this user and this Place; this module only applies time windows and picks the winner.
 */

import type { PlacesConfig } from '@/lib/places/config';
import type { PresenceProof } from '@/lib/places/types';

export type PresenceCheckIn = {
  id: string;
  proof: 'qr' | 'gps' | null;
  proof_weight: number | null;
  expires_at: string | null;
  checked_out_at: string | null;
};

/** An open `event_check_ins` row on an official event here that the caller found live now. */
export type PresenceEventCheckIn = { beacon_id: string; is_live: boolean };

export type PresenceEncounter = { encountered_at: string };

export type Presence =
  | { present: true; proof: PresenceProof; weight: number; checkInId?: string; beaconId?: string }
  | { present: false };

export function resolvePresence(input: {
  openCheckIn?: PresenceCheckIn | null;
  eventCheckIn?: PresenceEventCheckIn | null;
  recentEncounter?: PresenceEncounter | null;
  nowMs: number;
  config: PlacesConfig;
}): Presence {
  const { openCheckIn, eventCheckIn, recentEncounter, nowMs, config } = input;
  const candidates: Extract<Presence, { present: true }>[] = [];

  if (
    openCheckIn &&
    openCheckIn.checked_out_at == null &&
    openCheckIn.expires_at != null &&
    Date.parse(openCheckIn.expires_at) > nowMs &&
    openCheckIn.proof
  ) {
    candidates.push({
      present: true,
      proof: openCheckIn.proof,
      weight: openCheckIn.proof_weight ?? 0.6,
      checkInId: openCheckIn.id,
    });
  }

  if (eventCheckIn?.is_live) {
    candidates.push({ present: true, proof: 'event', weight: 0.9, beaconId: eventCheckIn.beacon_id });
  }

  if (recentEncounter) {
    const at = Date.parse(recentEncounter.encountered_at);
    if (Number.isFinite(at) && at > nowMs - config.presenceEncounterWindowMinutes * 60_000 && at <= nowMs + 60_000) {
      candidates.push({ present: true, proof: 'encounter', weight: 1.0 });
    }
  }

  if (candidates.length === 0) return { present: false };
  // Strongest wins; on a tie the Place check-in (pushed first) wins so the Pulse links to it.
  return candidates.reduce((best, c) => (c.weight > best.weight ? c : best));
}
