/**
 * Terrain elevation (m above sea level) from Open-Meteo forecast DEM (`elevation`).
 * Mirrors `fetchTerrainElevationM` in `supabase/functions/bind-proximity-connection`.
 */
export const OPEN_METEO_ELEVATION_TIMEOUT_MS = 8_000;
/** @deprecated Use OPEN_METEO_ELEVATION_TIMEOUT_MS — Open-Elevation is no longer used. */
export const OPEN_ELEVATION_LOOKUP_TIMEOUT_MS = OPEN_METEO_ELEVATION_TIMEOUT_MS;

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

/**
 * Above this reported barometric 1σ uncertainty the broad height band is not trustworthy
 * (GROUND_LEVEL is only 11 m wide), so no category is derived. The raw reading and the
 * terrain-relative altitude are still stored. Readings with unknown uncertainty (legacy
 * clients) keep the previous behavior.
 */
export const BAROMETRIC_CATEGORY_MAX_ACCURACY_M = 10;

export type TerrainRelativeAltitude = {
  relative_altitude_m: number;
  /** DEM input, stored so the derived value keeps its provenance. */
  terrain_elevation_m: number;
  elevation_category?: HeightCategoryName;
};

/**
 * `relative_altitude_m = barometric AMSL − DEM terrain AMSL`, computed only when both inputs
 * are valid. Both inputs belong to the same reporting device's observation.
 */
export function deriveTerrainRelativeAltitude(input: {
  barometricAltitudeM: number | null | undefined;
  barometricAccuracyM?: number | null;
  terrainElevationM: number | null | undefined;
}): TerrainRelativeAltitude | null {
  const { barometricAltitudeM, barometricAccuracyM, terrainElevationM } = input;
  if (barometricAltitudeM == null || !Number.isFinite(barometricAltitudeM)) return null;
  if (terrainElevationM == null || !Number.isFinite(terrainElevationM)) return null;
  const relativeAltitudeM = barometricAltitudeM - terrainElevationM;
  const out: TerrainRelativeAltitude = {
    relative_altitude_m: relativeAltitudeM,
    terrain_elevation_m: terrainElevationM,
  };
  const confident =
    barometricAccuracyM == null ||
    (Number.isFinite(barometricAccuracyM) && barometricAccuracyM <= BAROMETRIC_CATEGORY_MAX_ACCURACY_M);
  const category = confident ? deriveHeightCategoryFromRelativeAltitudeM(relativeAltitudeM) : null;
  if (category != null) out.elevation_category = category;
  return out;
}

/**
 * Columns to store for one encounter's terrain: the DEM elevation whenever it is known (it is a
 * property of the coordinate, not of the barometer), plus the terrain-relative altitude and
 * height band when the same device also reported a barometric altitude.
 */
export function terrainColumns(input: {
  barometricAltitudeM: number | null | undefined;
  barometricAccuracyM?: number | null;
  terrainElevationM: number | null | undefined;
}): Partial<TerrainRelativeAltitude> {
  const derived = deriveTerrainRelativeAltitude(input);
  if (derived != null) return derived;
  const { terrainElevationM } = input;
  return terrainElevationM != null && Number.isFinite(terrainElevationM)
    ? { terrain_elevation_m: terrainElevationM }
    : {};
}

export async function fetchTerrainElevationMeters(lat: number, lon: number): Promise<number | null> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    '&current=temperature_2m';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OPEN_METEO_ELEVATION_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, cache: 'no-store' });
    if (!res.ok) return null;
    const data = (await res.json()) as { elevation?: unknown };
    const raw = data.elevation;
    return typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
