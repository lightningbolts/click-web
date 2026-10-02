import { createAdminClient } from '@/lib/server/connectionWriteAuth';
import {
  deriveTerrainRelativeAltitude,
  fetchTerrainElevationMeters,
} from '@/lib/server/terrainElevation';
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

function toConditionLabel(weatherCode: number): string {
  if (weatherCode === 0) return 'Sunny';
  if ([1, 2, 3].includes(weatherCode)) return 'Cloudy';
  if ([45, 48].includes(weatherCode)) return 'Foggy';
  if ([51, 53, 55, 56, 57].includes(weatherCode)) return 'Drizzly';
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(weatherCode)) return 'Rainy';
  if ([71, 73, 75, 77, 85, 86].includes(weatherCode)) return 'Snowy';
  if ([95, 96, 99].includes(weatherCode)) return 'Stormy';
  return 'Clear';
}

function toIconCode(weatherCode: number): string {
  if (weatherCode === 0) return 'clear';
  if ([1, 2, 3].includes(weatherCode)) return 'cloudy';
  if ([45, 48].includes(weatherCode)) return 'fog';
  if ([51, 53, 55, 56, 57].includes(weatherCode)) return 'drizzle';
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(weatherCode)) return 'rain';
  if ([71, 73, 75, 77, 85, 86].includes(weatherCode)) return 'snow';
  if ([95, 96, 99].includes(weatherCode)) return 'thunder';
  return 'clear';
}

export async function enrichEncounterWeather(
  adminClient: ReturnType<typeof createAdminClient>,
  connectionId: string,
  lat: number,
  lon: number,
  memoryCapsule: MemoryCapsulePayload,
) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) {
    return;
  }

  try {
    const weatherResponse = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`,
      { cache: 'no-store' }
    );

    if (!weatherResponse.ok) {
      return;
    }

    const weatherJson = await weatherResponse.json() as {
      current_weather?: { temperature?: number; weathercode?: number };
    };
    const currentWeather = weatherJson.current_weather;
    if (
      currentWeather?.temperature == null ||
      currentWeather.weathercode == null
    ) {
      return;
    }

    const enrichedCapsule: MemoryCapsulePayload = {
      ...memoryCapsule,
      weatherSnapshot: {
        condition: toConditionLabel(currentWeather.weathercode),
        temperatureCelsius: currentWeather.temperature,
        iconCode: toIconCode(currentWeather.weathercode),
      },
    };

    const { data: latestEnc, error: encLookupErr } = await adminClient
      .from('connection_encounters')
      .select('id')
      .eq('connection_id', connectionId)
      .order('encountered_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (encLookupErr || !latestEnc?.id) {
      if (encLookupErr) console.error('Encounter lookup for weather:', encLookupErr);
      return;
    }

    const { error } = await adminClient
      .from('connection_encounters')
      .update({
        weather_snapshot: enrichedCapsule.weatherSnapshot,
      })
      .eq('id', latestEnc.id);

    if (error) {
      console.error('Encounter weather update error:', error);
    }
  } catch (error) {
    console.error('Memory capsule weather fetch error:', error);
  }
}

/**
 * Computes terrain-relative altitude after insert so the DEM lookup never delays the response.
 * Targets `encounterId` when known (otherwise the connection's newest row), stores the DEM
 * value with the derived altitude, and derives no height category from a poor barometer.
 */
export async function enrichEncounterRelativeAltitude(
  adminClient: ReturnType<typeof createAdminClient>,
  connectionId: string,
  barometricElevationM: number,
  lat: number,
  lon: number,
  opts: { encounterId?: string | null; barometricAccuracyM?: number | null } = {},
) {
  if (
    !Number.isFinite(barometricElevationM) ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    (lat === 0 && lon === 0)
  ) {
    return;
  }

  try {
    const terrain = deriveTerrainRelativeAltitude({
      barometricAltitudeM: barometricElevationM,
      barometricAccuracyM: opts.barometricAccuracyM,
      terrainElevationM: await fetchTerrainElevationMeters(lat, lon),
    });
    if (terrain == null) return;

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
        if (encLookupErr) console.error('Encounter lookup for relative altitude:', encLookupErr);
        return;
      }
      encounterId = String(latestEnc.id);
    }

    const { error } = await adminClient
      .from('connection_encounters')
      .update(terrain)
      .eq('id', encounterId);

    if (error) {
      console.error('Encounter relative altitude update error:', error);
    }
  } catch (error) {
    console.error('Relative altitude enrichment error:', error);
  }
}
