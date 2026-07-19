/**
 * @jest-environment node
 */

import {
  resolveCheckInRadiusMeters,
  applyVenueScaleToMetadata,
  isEventLiveForCheckIn,
  isValidCheckInCoordinate,
  VENUE_SCALE_RADIUS_METERS,
} from '@/lib/server/eventEngagement';

describe('eventEngagement helpers', () => {
  it('maps venue_scale presets', () => {
    expect(resolveCheckInRadiusMeters({ venue_scale: 'intimate' }).radiusMeters).toBe(
      VENUE_SCALE_RADIUS_METERS.intimate,
    );
    expect(resolveCheckInRadiusMeters({ venue_scale: 'campus' }).radiusMeters).toBe(2500);
    expect(resolveCheckInRadiusMeters({}).radiusMeters).toBe(250);
  });

  it('clamps explicit check_in_radius_meters', () => {
    expect(resolveCheckInRadiusMeters({ check_in_radius_meters: 10 }).radiusMeters).toBe(25);
    expect(resolveCheckInRadiusMeters({ check_in_radius_meters: 9000 }).radiusMeters).toBe(5000);
  });

  it('applyVenueScaleToMetadata writes both keys', () => {
    const meta = applyVenueScaleToMetadata({ title: 'x', venue_scale: 'venue' });
    expect(meta.venue_scale).toBe('venue');
    expect(meta.check_in_radius_meters).toBe(750);
  });

  it('rejects (0,0) and invalid coords', () => {
    expect(isValidCheckInCoordinate(0, 0)).toBe(false);
    expect(isValidCheckInCoordinate(47.6, -122.3)).toBe(true);
  });

  it('live window includes 24h early grace', () => {
    const start = new Date(Date.now() + 10 * 60_000).toISOString();
    const end = new Date(Date.now() + 2 * 3600_000).toISOString();
    expect(
      isEventLiveForCheckIn({ event_start_at: start, event_end_at: end }),
    ).toBe(true);
    const withinDay = new Date(Date.now() + 12 * 3600_000).toISOString();
    expect(
      isEventLiveForCheckIn({ event_start_at: withinDay, event_end_at: end }),
    ).toBe(true);
    const farStart = new Date(Date.now() + 48 * 3600_000).toISOString();
    const farEnd = new Date(Date.now() + 50 * 3600_000).toISOString();
    expect(
      isEventLiveForCheckIn({ event_start_at: farStart, event_end_at: farEnd }),
    ).toBe(false);
  });
});
