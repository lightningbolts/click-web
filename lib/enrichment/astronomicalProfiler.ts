import type { SolarState } from '@/lib/enrichment/vibeCaptureSchema';

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

function toJulianDay(date: Date): number {
  return date.getTime() / 86400000 - date.getTimezoneOffset() / 1440 + 2440587.5;
}

/**
 * Solar elevation in degrees at the given instant (positive = above horizon).
 * Lightweight Meeus-style approximation — no external deps.
 */
export function solarElevationDegrees(lat: number, lon: number, date: Date): number {
  const jd = toJulianDay(date);
  const n = jd - 2451545.0;
  const L = (280.46 + 0.9856474 * n) % 360;
  const g = ((357.528 + 0.9856003 * n) % 360) * DEG;
  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * DEG;
  const epsilon = 23.439 * DEG;
  const declRad = Math.asin(Math.sin(epsilon) * Math.sin(lambda));

  const utcHours =
    date.getUTCHours() +
    date.getUTCMinutes() / 60 +
    date.getUTCSeconds() / 3600 +
    date.getUTCMilliseconds() / 3600000;
  const solarTime = utcHours + lon / 15;
  const hourAngleRad = (solarTime - 12) * 15 * DEG;

  const latRad = lat * DEG;
  const sinElev =
    Math.sin(latRad) * Math.sin(declRad) +
    Math.cos(latRad) * Math.cos(declRad) * Math.cos(hourAngleRad);

  return Math.asin(Math.max(-1, Math.min(1, sinElev))) * RAD;
}

/**
 * Classifies ambient solar lighting state from elevation angle.
 */
export function classifySolarState(elevationDeg: number): SolarState {
  if (elevationDeg > 6) return 'Daytime';
  if (elevationDeg > 0) return 'Golden Hour';
  if (elevationDeg > -4) return 'Civil Twilight';
  if (elevationDeg > -6) return 'Blue Hour';
  return 'Nighttime';
}

export function profileSolarState(
  lat: number,
  lon: number,
  utcIso: string,
): { solar_state: SolarState; elevation_deg: number } | null {
  const date = new Date(utcIso);
  if (Number.isNaN(date.getTime())) return null;
  const elevation_deg = solarElevationDegrees(lat, lon, date);
  return {
    solar_state: classifySolarState(elevation_deg),
    elevation_deg,
  };
}
