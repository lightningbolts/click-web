/**
 * Click Places tunables from the `click_places` feature flag config (§3.3 step 10, §4.1).
 * Pure: a local clamp mirrors `configNumber` from `lib/server/featureFlags.ts` (out-of-range or
 * non-numeric values fall back to the default).
 */

export type PlacesConfig = {
  checkinTtlMinutes: number;
  gpsMaxAccuracyMeters: number;
  qrGpsSlackMultiplier: number;
  pulseWindowMinutes: number;
  pulseHalfLifeMinutes: number;
  pulseCooldownMinutes: number;
  pulseEditWindowMinutes: number;
  presenceEncounterWindowMinutes: number;
  wouldReturnWindowMinutes: number;
  lastPulseLookbackHours: number;
  patternWeeks: number;
  beenHereDays: number;
  nearbyDefaultRadiusMeters: number;
  nearbyMaxRadiusMeters: number;
  nearbyMaxLimit: number;
};

type Spec = { key: string; fallback: number; min: number; max: number };

const SPECS: Record<keyof PlacesConfig, Spec> = {
  checkinTtlMinutes: { key: 'checkin_ttl_minutes', fallback: 180, min: 30, max: 480 },
  gpsMaxAccuracyMeters: { key: 'gps_max_accuracy_meters', fallback: 100, min: 25, max: 200 },
  qrGpsSlackMultiplier: { key: 'qr_gps_slack_multiplier', fallback: 3, min: 1, max: 10 },
  pulseWindowMinutes: { key: 'pulse_window_minutes', fallback: 90, min: 15, max: 360 },
  pulseHalfLifeMinutes: { key: 'pulse_half_life_minutes', fallback: 30, min: 5, max: 180 },
  pulseCooldownMinutes: { key: 'pulse_cooldown_minutes', fallback: 45, min: 5, max: 240 },
  pulseEditWindowMinutes: { key: 'pulse_edit_window_minutes', fallback: 15, min: 1, max: 60 },
  presenceEncounterWindowMinutes: { key: 'presence_encounter_window_minutes', fallback: 180, min: 15, max: 720 },
  wouldReturnWindowMinutes: { key: 'would_return_window_minutes', fallback: 180, min: 15, max: 720 },
  lastPulseLookbackHours: { key: 'last_pulse_lookback_hours', fallback: 168, min: 1, max: 720 },
  patternWeeks: { key: 'pattern_weeks', fallback: 8, min: 1, max: 26 },
  beenHereDays: { key: 'been_here_days', fallback: 90, min: 7, max: 365 },
  nearbyDefaultRadiusMeters: { key: 'nearby_default_radius_meters', fallback: 5000, min: 50, max: 50000 },
  nearbyMaxRadiusMeters: { key: 'nearby_max_radius_meters', fallback: 50000, min: 50, max: 50000 },
  nearbyMaxLimit: { key: 'nearby_max_limit', fallback: 200, min: 1, max: 200 },
};

function clampedNumber(raw: Record<string, unknown>, spec: Spec): number {
  const value = raw[spec.key];
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(n) || n < spec.min || n > spec.max) return spec.fallback;
  return n;
}

export const DEFAULT_PLACES_CONFIG: PlacesConfig = placesConfigFrom({});

export function placesConfigFrom(raw: Record<string, unknown> | null | undefined): PlacesConfig {
  const source = raw ?? {};
  const out = {} as PlacesConfig;
  for (const name of Object.keys(SPECS) as (keyof PlacesConfig)[]) {
    out[name] = clampedNumber(source, SPECS[name]);
  }
  return out;
}
