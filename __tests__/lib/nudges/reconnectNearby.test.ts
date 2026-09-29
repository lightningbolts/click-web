/** @jest-environment node */

import {
  DEFAULT_RECONNECT_CONFIG,
  coarsen,
  pickReconnectNudge,
  placeCell,
  reconnectNearbyCopy,
  type PeerEncounter,
} from '@/lib/nudges/reconnectNearby';

const DAY = 86_400_000;
const NOW = Date.parse('2026-10-05T18:00:00Z');
const HERE = { lat: 47.6553, lng: -122.3035 };

const enc = (id: string, peer: string, daysAgo: number, dLat = 0, place = 'Suzzallo'): PeerEncounter => ({
  encounterId: id,
  connectionId: `c-${peer}`,
  peerId: peer,
  atMs: NOW - daysAgo * DAY,
  lat: HERE.lat + dLat,
  lng: HERE.lng,
  placeName: place,
});

const base = {
  here: HERE,
  nowMs: NOW,
  shown: [],
  mutedPeople: new Set<string>(),
  mutedPlaces: new Set<string>(),
  config: DEFAULT_RECONNECT_CONFIG,
};

describe('pickReconnectNudge', () => {
  it('picks a connection met here at least 14 days ago', () => {
    const pick = pickReconnectNudge({ ...base, encounters: [enc('e1', 'maya', 40)] });
    expect(pick?.encounter.peerId).toBe('maya');
  });

  it('never nudges for recent encounters, or for people met anywhere in the last 14 days', () => {
    expect(pickReconnectNudge({ ...base, encounters: [enc('e1', 'maya', 13)] })).toBeNull();
    expect(pickReconnectNudge({ ...base, encounters: [enc('e1', 'maya', 40), enc('e2', 'maya', 3, 0.05)] })).toBeNull();
  });

  it('ignores encounters outside the radius', () => {
    expect(pickReconnectNudge({ ...base, encounters: [enc('e1', 'maya', 40, 0.002)] })).toBeNull(); // ~220 m
  });

  it('suppresses places the viewer is at all the time', () => {
    const frequent = [1, 20, 25, 30, 35].map((d, i) => enc(`f${i}`, `p${i}`, d));
    expect(pickReconnectNudge({ ...base, encounters: [...frequent, enc('e1', 'maya', 40)] })).toBeNull();
  });

  it('shows at most one a day and cools a connection for 30 days', () => {
    const encounters = [enc('e1', 'maya', 40), enc('e2', 'sam', 60)];
    expect(pickReconnectNudge({ ...base, encounters, shown: [{ connectionId: 'c-x', shownAtMs: NOW - 2 * 3_600_000, dismissed: false }] })).toBeNull();
    const pick = pickReconnectNudge({ ...base, encounters, shown: [{ connectionId: 'c-maya', shownAtMs: NOW - 10 * DAY, dismissed: true }] });
    expect(pick?.encounter.peerId).toBe('sam');
    const later = pickReconnectNudge({ ...base, encounters, shown: [{ connectionId: 'c-maya', shownAtMs: NOW - 31 * DAY, dismissed: true }] });
    expect(later?.encounter.peerId).toBe('maya');
  });

  it('respects muted people and places', () => {
    const encounters = [enc('e1', 'maya', 40)];
    expect(pickReconnectNudge({ ...base, encounters, mutedPeople: new Set(['maya']) })).toBeNull();
    expect(pickReconnectNudge({ ...base, encounters, mutedPlaces: new Set([placeCell(HERE.lat, HERE.lng)]) })).toBeNull();
  });

  it('prefers the closest meeting place', () => {
    const pick = pickReconnectNudge({ ...base, encounters: [enc('far', 'sam', 40, 0.0006), enc('near', 'maya', 90)] });
    expect(pick?.encounter.encounterId).toBe('near');
  });
});

describe('reconnect copy and coarsening', () => {
  it('coarsens to ~100 m cells', () => {
    expect(coarsen(47.65534)).toBe(47.655);
    expect(placeCell(47.65534, -122.30351)).toBe('47.655,-122.304');
  });

  it('recalls only the past meeting', () => {
    expect(reconnectNearbyCopy('Maya', Date.parse('2026-06-12T18:00:00Z'), NOW).body).toBe('You met Maya near here in June. Say hi?');
    expect(reconnectNearbyCopy('Maya', Date.parse('2025-06-12T18:00:00Z'), NOW).body).toBe('You met Maya near here in June 2025. Say hi?');
  });
});
