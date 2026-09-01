import { parseMapBeacon, resolveBeaconHubId } from '@/lib/map/mapBeacons';

const liveBeacon = {
  id: '11111111-1111-4111-8111-111111111111',
  creator_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  venue_id: null,
  beacon_type: 'event',
  show_creator_name: false,
  visibility_audience: 'everyone',
  lat: 47.65,
  lng: -122.3,
  created_at: '2026-08-30T20:00:00.000Z',
  expires_at: '2026-09-01T20:00:00.000Z',
};

describe('resolveBeaconHubId', () => {
  it('uses an injected JSON hub_id when set', () => {
    expect(
      resolveBeaconHubId({
        hub_id: 'hub_live',
        metadata: { hub_id: 'hub_stale' },
      }),
    ).toBe('hub_live');
  });

  it('falls back to metadata when the JSON field is missing or null', () => {
    expect(resolveBeaconHubId({ metadata: { hub_id: 'hub_legacy' } })).toBe('hub_legacy');
    expect(
      resolveBeaconHubId({
        hub_id: null,
        metadata: { hub_id: 'hub_from_meta' },
      }),
    ).toBe('hub_from_meta');
  });
});

describe('parseMapBeacon hub_id', () => {
  it('reads hub_id from metadata when the column is absent', () => {
    const parsed = parseMapBeacon({
      ...liveBeacon,
      metadata: { title: 'Show', hub_id: 'hub_from_meta' },
    });
    expect(parsed?.hub_id).toBe('hub_from_meta');
  });
});
