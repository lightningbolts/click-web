/**
 * Terrain elevation (m above sea level) at a point from Open-Elevation (SRTM-backed DEM).
 * Mirrors `fetchTerrainElevationM` in `supabase/functions/bind-proximity-connection` (bind uses a shorter timeout).
 */
export const OPEN_ELEVATION_LOOKUP_TIMEOUT_MS = 8_000;

export type HeightCategoryName =
  | 'BELOW_GROUND'
  | 'GROUND_LEVEL'
  | 'ELEVATED'
  | 'HIGH_RISE';

/**
 * Classifies height above local ground (AGL). Pass `relative_altitude_m`
 * (barometric AMSL − DEM terrain), never raw AMSL.
 * Thresholds mirror KMP `deriveHeightCategory` in MemoryCapsule.kt.
 */
export function deriveHeightCategoryFromRelativeAltitudeM(
  relativeAltitudeM: number | null | undefined,
): HeightCategoryName | null {
  if (relativeAltitudeM == null || !Number.isFinite(relativeAltitudeM)) return null;
  if (relativeAltitudeM < -3.0) return 'BELOW_GROUND';
  if (relativeAltitudeM < 8.0) return 'GROUND_LEVEL';
  if (relativeAltitudeM < 35.0) return 'ELEVATED';
  return 'HIGH_RISE';
}

export async function fetchTerrainElevationMeters(lat: number, lon: number): Promise<number | null> {
  const url = `https://api.open-elevation.com/api/v1/lookup?locations=${lat},${lon}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OPEN_ELEVATION_LOOKUP_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, cache: 'no-store' });
    if (!res.ok) return null;
    const data = (await res.json()) as { results?: { elevation?: unknown }[] };
    const raw = data.results?.[0]?.elevation;
    return typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
