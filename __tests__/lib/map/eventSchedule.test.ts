import {
  filterActiveBeaconsForDiscovery,
  isActiveForDiscoveryFeed,
  isVisibleEventBeacon,
  parseEventScheduleFromMetadata,
  resolveBeaconExpiresAtIso,
  validateEventSchedule,
} from '@/lib/map/eventSchedule';
import type { MapBeaconRecord } from '@/lib/map/mapBeacons';

function eventBeacon(
  overrides: Partial<MapBeaconRecord> & { metadata: Record<string, unknown> },
): MapBeaconRecord {
  return {
    id: 'evt-1',
    creator_id: 'user-1',
    venue_id: null,
    beacon_type: 'event',
    show_creator_name: false,
    visibility_audience: 'everyone',
    lat: 1,
    lng: 2,
    created_at: new Date(0).toISOString(),
    expires_at: new Date(0).toISOString(),
    ...overrides,
  };
}

describe('eventSchedule', () => {
  it('parseEventScheduleFromMetadata reads ISO fields', () => {
    const start = '2026-06-12T19:00:00.000Z';
    const end = '2026-06-12T21:00:00.000Z';
    const schedule = parseEventScheduleFromMetadata({ event_start_at: start, event_end_at: end });
    expect(schedule?.startEpochMs).toBe(Date.parse(start));
    expect(schedule?.endEpochMs).toBe(Date.parse(end));
  });

  it('isVisibleEventBeacon uses schedule end when expires_at is stale', () => {
    const now = Date.parse('2026-06-12T18:00:00.000Z');
    const beacon = eventBeacon({
      expires_at: new Date(now - 60_000).toISOString(),
      metadata: {
        event_start_at: '2026-06-12T19:00:00.000Z',
        event_end_at: '2026-06-12T21:00:00.000Z',
      },
    });
    expect(isVisibleEventBeacon(beacon, now)).toBe(true);
    expect(isActiveForDiscoveryFeed(beacon, now)).toBe(true);
  });

  it('filterActiveBeaconsForDiscovery drops ended events', () => {
    const now = Date.parse('2026-06-12T22:00:00.000Z');
    const active = eventBeacon({
      expires_at: new Date(now + 60_000).toISOString(),
      metadata: {
        event_start_at: '2026-06-12T19:00:00.000Z',
        event_end_at: '2026-06-12T21:00:00.000Z',
      },
    });
    expect(filterActiveBeaconsForDiscovery([active], now)).toHaveLength(0);
  });

  it('resolveBeaconExpiresAtIso uses event_end_at for event beacons', () => {
    const end = '2026-06-12T21:00:00.000Z';
    const now = Date.parse('2026-06-12T17:00:00.000Z');
    const result = resolveBeaconExpiresAtIso(
      'event',
      {
        description: 'Meetup',
        event_start_at: '2026-06-12T19:00:00.000Z',
        event_end_at: end,
      },
      {},
      now,
    );
    expect('expiresAtIso' in result).toBe(true);
    if ('expiresAtIso' in result) {
      expect(result.expiresAtIso).toBe(end);
    }
  });

  it('validateEventSchedule rejects duration over one month', () => {
    const start = 0;
    const end = start + 31 * 24 * 60 * 60 * 1000;
    expect(validateEventSchedule(start, end, -60_000)).toMatch(/1 month/i);
  });
});
