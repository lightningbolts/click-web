import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/server/connectionWriteAuth';
import { buildEncounterInsertFromSensor } from '@/lib/connections/encounterSensorPayload';
import { scheduleEventEnrichment } from '@/lib/enrichment/scheduleEventEnrichment';
import { fireEncounterGeoEnrichment } from '@/lib/server/proximity/encounterEnrichment';
import {
  applyLiveEventBeaconToEncounterRow,
  resolveLiveEventBeaconForReportingUser,
} from '@/lib/server/resolveLiveEventBeaconAt';

export type RecordEncounterResult =
  | { ok: true; encounterId: string | null }
  | { ok: false; rateLimited: true }
  | { ok: false; rateLimited: false; error: string };

export function isEncounterRateLimitError(err: { message?: string; details?: string; hint?: string } | null): boolean {
  if (!err) return false;
  const combined = [
    err.message ?? '',
    err.details ?? '',
    err.hint ?? '',
  ].join(' ');
  return combined.includes('encounter_rate_limit_3h');
}

/**
 * Inserts one `connection_encounters` row for an already-authorized pair (Tap to Connect, or a
 * hangout both people confirmed): sensor/GPS columns, the live event at that spot, then
 * geo/weather/event enrichment after the response. `client` is the caller's (RLS) client for
 * user requests, or the admin client for server-verified writes.
 */
export async function recordEncounter(
  client: SupabaseClient,
  args: { connectionId: string; reportingUserId: string; sensorData?: unknown; encounteredAt?: string },
): Promise<RecordEncounterResult> {
  const { connectionId, sensorData } = args;
  const userId = args.reportingUserId;
  const insertRow: Record<string, unknown> = {
    ...buildEncounterInsertFromSensor(connectionId, sensorData),
    reporting_user_id: userId,
    ...(args.encounteredAt ? { encountered_at: args.encounteredAt } : {}),
  };

  const gpsLatPre = typeof insertRow.gps_lat === 'number' ? insertRow.gps_lat : null;
  const gpsLonPre = typeof insertRow.gps_lon === 'number' ? insertRow.gps_lon : null;
  // Skip admin client when there is no GPS — live-event attachment cannot resolve without coords.
  const liveEventAttachment =
    gpsLatPre != null && gpsLonPre != null
      ? await resolveLiveEventBeaconForReportingUser(
          createAdminClient(),
          gpsLatPre,
          gpsLonPre,
          userId,
        )
      : null;
  Object.assign(insertRow, applyLiveEventBeaconToEncounterRow(insertRow, liveEventAttachment));

  const { data: inserted, error: insErr } = await client
    .from('connection_encounters')
    .insert(insertRow)
    .select('id')
    .maybeSingle();

  if (insErr) {
    if (isEncounterRateLimitError(insErr)) return { ok: false, rateLimited: true };
    console.error('connections/encounter insert:', insErr.message ?? '');
    return { ok: false, rateLimited: false, error: 'Failed to record encounter' };
  }

  const encounterId = inserted?.id != null ? String(inserted.id) : null;
  const gpsLat = typeof insertRow.gps_lat === 'number' ? insertRow.gps_lat : null;
  const gpsLon = typeof insertRow.gps_lon === 'number' ? insertRow.gps_lon : null;
  if (encounterId && gpsLat != null && gpsLon != null) {
    scheduleEventEnrichment({
      encounter_id: encounterId,
      lat: gpsLat,
      lon: gpsLon,
      timestamp:
        typeof insertRow.encountered_at === 'string'
          ? insertRow.encountered_at
          : new Date().toISOString(),
    });
    const baro =
      typeof insertRow.exact_barometric_elevation_m === 'number'
        ? insertRow.exact_barometric_elevation_m
        : null;
    const locName = typeof insertRow.location_name === 'string' ? insertRow.location_name : null;
    const weather =
      typeof insertRow.weather_snapshot === 'string' ? insertRow.weather_snapshot : null;
    fireEncounterGeoEnrichment(
      createAdminClient(),
      connectionId,
      userId,
      gpsLat,
      gpsLon,
      baro,
      locName,
      weather,
    );
  }
  return { ok: true, encounterId };
}
