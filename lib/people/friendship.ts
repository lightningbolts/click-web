import type { ConnectionEncounterRow } from '@/lib/dashboard/connectionEncounters';

/** A named step in a friendship, earned by hangouts together (iOS `FriendshipLevel`). */
export type FriendshipLevel = {
  rank: number;
  name: 'New Click' | 'Familiar' | 'Regulars' | 'Close' | 'Inseparable';
  threshold: number;
};

export const FRIENDSHIP_LEVELS: readonly FriendshipLevel[] = [
  { rank: 1, name: 'New Click', threshold: 1 },
  { rank: 2, name: 'Familiar', threshold: 3 },
  { rank: 3, name: 'Regulars', threshold: 6 },
  { rank: 4, name: 'Close', threshold: 12 },
  { rank: 5, name: 'Inseparable', threshold: 25 },
];

export function friendshipLevelFor(hangouts: number): FriendshipLevel {
  let level = FRIENDSHIP_LEVELS[0];
  for (const l of FRIENDSHIP_LEVELS) if (hangouts >= l.threshold) level = l;
  return level;
}

export type FriendshipStats = {
  hangouts: number;
  /** Distinct places (a named venue, or a ~110 m cell). */
  places: number;
  firstMetIso: string | null;
  lastMetIso: string | null;
  level: FriendshipLevel;
  nextLevel: FriendshipLevel | null;
  /** 0…1 from this level to the next; 1 at the top level. */
  progress: number;
  /** Map pins, one per place, earliest visit first. */
  pins: { id: string; lat: number; lng: number; label?: string }[];
};

function spotKey(e: ConnectionEncounterRow): string | null {
  const name = (e.locationName ?? e.displayLocation)?.trim().toLowerCase();
  if (name) return `name:${name}`;
  if (typeof e.gpsLat !== 'number' || typeof e.gpsLon !== 'number') return null;
  return `geo:${e.gpsLat.toFixed(3)},${e.gpsLon.toFixed(3)}`;
}

/** Everything the Together card says, derived only from real encounters (iOS `FriendshipStats`). */
export function computeFriendshipStats(encounters: readonly ConnectionEncounterRow[]): FriendshipStats {
  const sorted = [...encounters].sort((a, b) => Date.parse(a.encounteredAt) - Date.parse(b.encounteredAt));
  const hangouts = sorted.length;
  const level = friendshipLevelFor(hangouts);
  const nextLevel = FRIENDSHIP_LEVELS.find((l) => l.rank === level.rank + 1) ?? null;
  const progress = nextLevel
    ? Math.min(1, Math.max(0, (hangouts - level.threshold) / (nextLevel.threshold - level.threshold)))
    : 1;

  const seen = new Set<string>();
  const pins: FriendshipStats['pins'] = [];
  for (const e of sorted) {
    const key = spotKey(e);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    if (typeof e.gpsLat === 'number' && typeof e.gpsLon === 'number' && !(e.gpsLat === 0 && e.gpsLon === 0)) {
      pins.push({ id: e.id, lat: e.gpsLat, lng: e.gpsLon, label: e.locationName ?? e.displayLocation });
    }
  }

  return {
    hangouts,
    places: seen.size,
    firstMetIso: sorted[0]?.encounteredAt ?? null,
    lastMetIso: sorted[sorted.length - 1]?.encounteredAt ?? null,
    level,
    nextLevel,
    progress,
    pins,
  };
}
