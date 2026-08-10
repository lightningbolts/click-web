/**
 * @jest-environment node
 */

import { connectionMapPinGeo } from '@/lib/dashboard/connectionEncounters';

describe('connectionMapPinGeo', () => {
  it('prefers origin encounter GPS over a later beacon crossing', () => {
    const geo = connectionMapPinGeo({
      connection_encounters: [
        {
          id: 'later',
          connection_id: 'c1',
          encountered_at: '2026-08-01T18:00:00Z',
          gps_lat: 47.66,
          gps_lon: -122.3,
          event_beacon_id: 'b1',
        },
        {
          id: 'origin',
          connection_id: 'c1',
          encountered_at: '2026-01-01T12:00:00Z',
          gps_lat: 47.6,
          gps_lon: -122.33,
        },
      ],
    });
    expect(geo).toEqual({ latitude: 47.6, longitude: -122.33 });
  });

  it('prefers stored geo_location over encounters', () => {
    const geo = connectionMapPinGeo({
      geo_location: { lat: 37.77, lon: -122.42 },
      connection_encounters: [
        {
          id: 'later',
          connection_id: 'c1',
          encountered_at: '2026-08-01T18:00:00Z',
          gps_lat: 40,
          gps_lon: -70,
        },
      ],
    });
    expect(geo).toEqual({ latitude: 37.77, longitude: -122.42 });
  });
});
