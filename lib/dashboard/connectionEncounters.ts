/**
 * Normalizes embedded `connection_encounters` rows from PostgREST (`select('*, connection_encounters(*)')`).
 */

export type ConnectionEncounterRow = {
  id: string;
  encounteredAt: string;
  /** Present when `location_name` was captured for this crossing. */
  locationName?: string;
  gpsLat?: number;
  gpsLon?: number;
  weatherSnapshot: unknown;
  noiseLevel?: string;
  elevationCategory?: string;
  exactNoiseLevelDb?: number;
  exactBarometricElevationM?: number;
  relativeAltitudeM?: number;
  luxLevel?: number;
  motionVariance?: number;
  compassAzimuth?: number;
  batteryLevel?: number;
  contextTags: string[];
};

function numOrUndef(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim()) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

export function parseConnectionEncounters(conn: Record<string, unknown>): ConnectionEncounterRow[] {
  const raw = conn.connection_encounters;
  if (!Array.isArray(raw)) return [];
  const out: ConnectionEncounterRow[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const id = r.id != null ? String(r.id).trim() : '';
    const encounteredAt = r.encountered_at != null ? String(r.encountered_at).trim() : '';
    if (!id || !encounteredAt) continue;
    const tagsRaw = r.context_tags;
    const contextTags = Array.isArray(tagsRaw)
      ? tagsRaw.filter((t): t is string => typeof t === 'string' && t.trim().length > 0).map((t) => t.trim())
      : [];
    out.push({
      id,
      encounteredAt,
      locationName:
        typeof r.location_name === 'string' && r.location_name.trim() ? r.location_name.trim() : undefined,
      gpsLat: numOrUndef(r.gps_lat),
      gpsLon: numOrUndef(r.gps_lon),
      weatherSnapshot: r.weather_snapshot,
      noiseLevel: typeof r.noise_level === 'string' && r.noise_level.trim() ? r.noise_level.trim() : undefined,
      elevationCategory:
        typeof r.elevation_category === 'string' && r.elevation_category.trim()
          ? r.elevation_category.trim()
          : undefined,
      exactNoiseLevelDb: numOrUndef(r.exact_noise_level_db),
      exactBarometricElevationM: numOrUndef(r.exact_barometric_elevation_m),
      relativeAltitudeM: numOrUndef(r.relative_altitude_m),
      luxLevel: numOrUndef(r.lux_level),
      motionVariance: numOrUndef(r.motion_variance),
      compassAzimuth: numOrUndef(r.compass_azimuth),
      batteryLevel:
        typeof r.battery_level === 'number' && Number.isFinite(r.battery_level)
          ? Math.round(r.battery_level)
          : typeof r.battery_level === 'string' && r.battery_level.trim()
            ? (() => {
                const n = Number(r.battery_level);
                return Number.isFinite(n) ? Math.round(n) : undefined;
              })()
            : undefined,
      contextTags,
    });
  }
  return out.sort((a, b) => new Date(b.encounteredAt).getTime() - new Date(a.encounteredAt).getTime());
}

export function latestEncounter(conn: Record<string, unknown>): ConnectionEncounterRow | undefined {
  const all = parseConnectionEncounters(conn);
  return all[0];
}

export function originEncounter(conn: Record<string, unknown>): ConnectionEncounterRow | undefined {
  const all = parseConnectionEncounters(conn);
  return all.length ? all[all.length - 1] : undefined;
}
