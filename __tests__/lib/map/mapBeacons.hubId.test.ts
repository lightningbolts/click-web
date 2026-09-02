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
  it('keeps an explicit SQL NULL instead of falling back to metadata', () => {
    expect(
      resolveBeaconHubId({
        hub_id: null,
        metadata: { hub_id: 'hub_stale' },
      }),
    ).toBeNull();
  });

  it('uses the column when it is set', () => {
    expect(
      resolveBeaconHubId({
        hub_id: 'hub_live',
        metadata: { hub_id: 'hub_stale' },
      }),
    ).toBe('hub_live');
  });

  it('falls back to metadata only when the column is omitted', () => {
    expect(resolveBeaconHubId({ metadata: { hub_id: 'hub_legacy' } })).toBe('hub_legacy');
  });
});

describe('parseMapBeacon hub_id', () => {
  it('does not revive a deleted hub from metadata', () => {
    const parsed = parseMapBeacon({
      ...liveBeacon,
      hub_id: null,
      metadata: { title: 'Show', hub_id: 'hub_stale' },
    });
    expect(parsed?.hub_id).toBeNull();
  });
});
