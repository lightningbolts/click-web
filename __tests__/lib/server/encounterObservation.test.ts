/**
 * @jest-environment node
 */

import {
  encounterObservationColumns,
  parseEncounterObservation,
} from '@/lib/server/encounterObservation';

const NOW = Date.parse('2026-10-02T06:12:14.000Z');

describe('parseEncounterObservation', () => {
  it('keeps every valid field from the wire payload', () => {
    expect(
      parseEncounterObservation(
        {
          gps_horizontal_accuracy_m: 4.8,
          gps_vertical_accuracy_m: 8.2,
          gps_altitude_m: 52.3,
          gps_ellipsoidal_altitude_m: 71.1,
          gps_observed_at: '2026-10-02T06:12:13.421Z',
          gps_floor: 3,
          gps_full_accuracy: true,
          barometric_accuracy_m: 1.6,
          barometric_precision_m: 0.3,
          barometric_relative_altitude_m: 0.2,
          barometric_pressure_kpa: 100.82,
        },
        NOW,
      ),
    ).toEqual({
      gps_horizontal_accuracy_m: 4.8,
      gps_vertical_accuracy_m: 8.2,
      gps_altitude_m: 52.3,
      gps_ellipsoidal_altitude_m: 71.1,
      gps_observed_at: '2026-10-02T06:12:13.421Z',
      gps_floor: 3,
      gps_full_accuracy: true,
      barometric_accuracy_m: 1.6,
      barometric_precision_m: 0.3,
      barometric_relative_altitude_m: 0.2,
      barometric_pressure_kpa: 100.82,
    });
  });

  it('accepts legacy bodies with no metadata', () => {
    expect(parseEncounterObservation({ latitude: 47.6, longitude: -122.3 }, NOW)).toEqual({});
  });

  it('drops Core Location altitude when vertical accuracy is zero or negative', () => {
    for (const vertical of [0, -1]) {
      const parsed = parseEncounterObservation(
        { gps_horizontal_accuracy_m: 5, gps_vertical_accuracy_m: vertical, gps_altitude_m: 40, gps_ellipsoidal_altitude_m: 60 },
        NOW,
      );
      expect(parsed).toEqual({ gps_horizontal_accuracy_m: 5 });
    }
  });

  it('rejects negative, non-finite and mistyped values', () => {
    expect(
      parseEncounterObservation(
        {
          gps_horizontal_accuracy_m: -1,
          gps_floor: 2.5,
          gps_full_accuracy: 'true',
          gps_observed_at: 'yesterday',
          barometric_accuracy_m: Number.NaN,
          barometric_pressure_kpa: 1013,
        },
        NOW,
      ),
    ).toEqual({});
  });

  it('rejects fix timestamps far in the future', () => {
    expect(parseEncounterObservation({ gps_observed_at: '2026-10-02T07:00:00.000Z' }, NOW)).toEqual({});
  });
});

describe('encounterObservationColumns', () => {
  const observation = parseEncounterObservation(
    { gps_horizontal_accuracy_m: 6, gps_floor: 1, barometric_accuracy_m: 2 },
    NOW,
  );

  it('attaches location quality only with the same device coordinate', () => {
    expect(encounterObservationColumns(observation, { hasOwnCoordinate: false, hasBarometricAltitude: true })).toEqual({
      barometric_accuracy_m: 2,
    });
  });

  it('attaches barometer quality only with the barometric altitude', () => {
    expect(encounterObservationColumns(observation, { hasOwnCoordinate: true, hasBarometricAltitude: false })).toEqual({
      gps_horizontal_accuracy_m: 6,
      gps_floor: 1,
    });
  });
});
