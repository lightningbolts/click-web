import type { SupabaseClient } from '@supabase/supabase-js';
import { deriveHeightCategoryFromRelativeAltitudeM } from '@/lib/server/terrainElevation';
import {
  fetchNominatimReverseGeocode,
  fetchOpenMeteoForecast,
} from '@/lib/server/proximity/bindSupport';

/**
 * Post-insert enrichment of the member's newest encounter row: reverse geocode,
 * weather (when the client did not supply a snapshot), and terrain-relative
 * altitude. Never blocks the bind response — see fireEncounterGeoEnrichment.
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
  updates.display_location = geocoded.displayLocation;
  if (geocoded.semanticLocation != null) updates.semantic_location = geocoded.semanticLocation;
  const locationName = manualLocationName ?? geocoded.specificLocationName;
  if (locationName) updates.location_name = locationName;

  const forecast = await fetchOpenMeteoForecast(memberLat, memberLon);
  if (clientWeatherSnapshot == null && forecast.weatherSnapshot != null) {
    updates.weather_snapshot = forecast.weatherSnapshot;
  }

  if (memberExactBarometricElevationM != null && forecast.elevationM != null) {
    const relativeAltitudeM = memberExactBarometricElevationM - forecast.elevationM;
    updates.relative_altitude_m = relativeAltitudeM;
    const elevationCategory = deriveHeightCategoryFromRelativeAltitudeM(relativeAltitudeM);
    if (elevationCategory != null) {
      updates.elevation_category = elevationCategory;
    }
  }

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
): void {
  void scheduleEncounterGeoEnrichment(
    admin,
    connectionId,
    memberId,
    memberLat,
    memberLon,
    memberExactBarometricElevationM,
    manualLocationName,
    clientWeatherSnapshot,
  ).catch((error) => {
    console.warn('[proximity] encounter enrichment failed:', error);
  });
}
