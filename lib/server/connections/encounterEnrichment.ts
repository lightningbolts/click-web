import { createAdminClient } from '@/lib/server/connectionWriteAuth';
import { terrainColumns } from '@/lib/server/terrainElevation';
import { fetchOpenMeteoForecast } from '@/lib/server/proximity/bindSupport';
import { type ContextTagPayload } from '@/lib/server/connectionEncounterContextTag';

export type MemoryCapsulePayload = {
  connectionId: string;
  locationName: string | null;
  geoLocation: { lat: number; lon: number } | null;
  connectedAtMs: number;
  weatherSnapshot: {
    condition: string;
    temperatureCelsius: number;
    iconCode: string | null;
  } | null;
  contextTag: ContextTagPayload | null;
  photoUri: string | null;
  noiseLevelCategory: 'VERY_QUIET' | 'QUIET' | 'MODERATE' | 'LOUD' | 'VERY_LOUD' | null;
};

export function buildUtcTimeOfDayLabel(isoTimestamp: string): string {
  return `${isoTimestamp.slice(11, 19)} UTC`;
}

/**
 * Post-insert environment enrichment for one encounter row, from a single Open-Meteo request:
 * the full weather snapshot (only when the client sent none), the DEM terrain elevation, and,
 * when the same device reported a barometric altitude, the terrain-relative altitude and height
 * band. Targets `encounterId` when known (otherwise the connection's newest row) and never
 * delays the response — call it through `runAfterResponse`.
 */
export async function enrichEncounterEnvironment(
  adminClient: ReturnType<typeof createAdminClient>,
  connectionId: string,
  lat: number,
  lon: number,
  opts: {
    encounterId?: string | null;
    includeWeather: boolean;
    barometricElevationM?: number | null;
    barometricAccuracyM?: number | null;
  },
) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) {
    return;
  }

  try {
    const forecast = await fetchOpenMeteoForecast(lat, lon);
    const updates: Record<string, unknown> = terrainColumns({
      barometricAltitudeM: opts.barometricElevationM ?? null,
      barometricAccuracyM: opts.barometricAccuracyM,
      terrainElevationM: forecast.elevationM,
    });
    if (opts.includeWeather && forecast.weatherSnapshot != null) {
      updates.weather_snapshot = forecast.weatherSnapshot;
    }
    if (Object.keys(updates).length === 0) return;

    let encounterId = opts.encounterId ?? null;
    if (encounterId == null) {
      const { data: latestEnc, error: encLookupErr } = await adminClient
        .from('connection_encounters')
        .select('id')
        .eq('connection_id', connectionId)
        .order('encountered_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (encLookupErr || !latestEnc?.id) {
        if (encLookupErr) console.error('Encounter lookup for environment enrichment:', encLookupErr);
        return;
      }
      encounterId = String(latestEnc.id);
    }

    const { error } = await adminClient
      .from('connection_encounters')
      .update(updates)
      .eq('id', encounterId);

    if (error) {
      console.error('Encounter environment update error:', error);
    }
  } catch (error) {
    console.error('Encounter environment enrichment error:', error);
  }
}
