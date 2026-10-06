import { computeFriendshipStats, friendshipLevelFor } from '@/lib/people/friendship';
import type { ConnectionEncounterRow } from '@/lib/dashboard/connectionEncounters';

const enc = (id: string, at: string, extra: Partial<ConnectionEncounterRow> = {}): ConnectionEncounterRow => ({
  id,
  encounteredAt: at,
  weatherSnapshot: null,
  contextTags: [],
  ...extra,
});

describe('friendship levels (iOS parity)', () => {
  it.each([
    [0, 'New Click'],
    [2, 'New Click'],
    [3, 'Familiar'],
    [11, 'Regulars'],
    [12, 'Close'],
    [40, 'Inseparable'],
  ])('%i hangouts → %s', (n, name) => {
    expect(friendshipLevelFor(n).name).toBe(name);
  });
});

describe('computeFriendshipStats', () => {
  it('counts places by venue name or ~110 m cell and reports progress', () => {
    const stats = computeFriendshipStats([
      enc('c', '2026-03-01T10:00:00Z', { locationName: 'Blue Bottle', gpsLat: 1, gpsLon: 1 }),
      enc('a', '2026-01-01T10:00:00Z', { gpsLat: 37.7749, gpsLon: -122.4194 }),
      enc('b', '2026-02-01T10:00:00Z', { gpsLat: 37.77491, gpsLon: -122.41941 }),
      enc('d', '2026-04-01T10:00:00Z', { locationName: 'blue bottle' }),
    ]);
    expect(stats.hangouts).toBe(4);
    expect(stats.places).toBe(2);
    expect(stats.firstMetIso).toBe('2026-01-01T10:00:00Z');
    expect(stats.level.name).toBe('Familiar');
    expect(stats.nextLevel?.name).toBe('Regulars');
    expect(stats.progress).toBeCloseTo(1 / 3);
    expect(stats.pins.map((p) => p.id)).toEqual(['a', 'c']);
  });

  it('is empty-safe', () => {
    const stats = computeFriendshipStats([]);
    expect(stats).toMatchObject({ hangouts: 0, places: 0, firstMetIso: null, pins: [] });
  });
});
