import { DEFAULT_PLACES_CONFIG, placesConfigFrom } from '@/lib/places/config';

describe('placesConfigFrom', () => {
  it('uses defaults for missing or out-of-range values', () => {
    expect(DEFAULT_PLACES_CONFIG.checkinTtlMinutes).toBe(180);
    expect(DEFAULT_PLACES_CONFIG.nearbyMaxLimit).toBe(200);
    const c = placesConfigFrom({ checkin_ttl_minutes: 60, pulse_cooldown_minutes: 9999, pattern_weeks: '4', gps_max_accuracy_meters: 'x' });
    expect(c.checkinTtlMinutes).toBe(60);
    expect(c.pulseCooldownMinutes).toBe(45);
    expect(c.patternWeeks).toBe(4);
    expect(c.gpsMaxAccuracyMeters).toBe(100);
  });
});
