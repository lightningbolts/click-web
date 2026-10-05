import type { SupabaseClient } from '@supabase/supabase-js';
import { terrainColumns } from '@/lib/server/terrainElevation';
import {
  DISPLAY_LOCATION_FALLBACK,
  fetchNominatimReverseGeocode,
  fetchOpenMeteoForecast,
} from '@/lib/server/proximity/bindSupport';
import { runAfterResponse } from '@/lib/server/afterResponse';

/**
 * Post-insert enrichment of the member's newest encounter row: reverse geocode,
 * weather (when the client did not supply a snapshot), and terrain-relative
 * altitude. Never blocks the bind response — see fireEncounterGeoEnrichment.
 *
 * Every input is the reporting member's own observation; the DEM value is stored with the
 * derived altitude, and a poor barometer reading yields no height category.
 */
export async function scheduleEncounterGeoEnrichment(
  admin: SupabaseClient,
  connectionId: string,
  reportingUserId: string,
  memberLat: number | null,
  memberLon: number | null,
  memberExactBarometricElevationM: number | null,
  manualLocationName: string | null,
  clientWeatherSnapshot: string | null,
  memberBarometricAccuracyM: number | null = null,
): Promise<void> {
  if (memberLat == null || memberLon == null) return;

  const { data: latestEnc, error: encLookupErr } = await admin
    .from('connection_encounters')
    .select('id')
    .eq('connection_id', connectionId)
    .eq('reporting_user_id', reportingUserId)
    .order('encountered_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (encLookupErr || !latestEnc?.id) {
    if (encLookupErr) console.warn('[proximity] encounter enrichment lookup:', encLookupErr.message);
    return;
  }

  const updates: Record<string, unknown> = {};
  const geocoded = await fetchNominatimReverseGeocode(memberLat, memberLon);
  if (geocoded.displayLocation !== DISPLAY_LOCATION_FALLBACK) updates.display_location = geocoded.displayLocation;
  if (geocoded.semanticLocation != null) updates.semantic_location = geocoded.semanticLocation;
  const locationName = manualLocationName ?? geocoded.specificLocationName;
  if (locationName) updates.location_name = locationName;

  const forecast = await fetchOpenMeteoForecast(memberLat, memberLon);
  if (clientWeatherSnapshot == null && forecast.weatherSnapshot != null) {
    updates.weather_snapshot = forecast.weatherSnapshot;
  }

  Object.assign(
    updates,
    terrainColumns({
      barometricAltitudeM: memberExactBarometricElevationM,
      barometricAccuracyM: memberBarometricAccuracyM,
      terrainElevationM: forecast.elevationM,
    }),
  );

  if (Object.keys(updates).length === 0) return;

  const { error } = await admin.from('connection_encounters').update(updates).eq('id', latestEnc.id);
  if (error) {
    console.warn('[proximity] encounter enrichment update:', error.message);
  }
}

export function fireEncounterGeoEnrichment(
  admin: SupabaseClient,
  connectionId: string,
  memberId: string,
  memberLat: number | null,
  memberLon: number | null,
  memberExactBarometricElevationM: number | null,
  manualLocationName: string | null,
  clientWeatherSnapshot: string | null,
  memberBarometricAccuracyM: number | null = null,
): void {
  runAfterResponse('proximity encounter enrichment', () =>
    scheduleEncounterGeoEnrichment(
      admin,
      connectionId,
      memberId,
      memberLat,
      memberLon,
      memberExactBarometricElevationM,
      manualLocationName,
      clientWeatherSnapshot,
      memberBarometricAccuracyM,
    ),
  );
}
