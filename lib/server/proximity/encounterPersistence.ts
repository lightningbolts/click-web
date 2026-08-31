import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeContextTagsArray } from '@/lib/server/connectionEncounterContextTag';
import {
  AT_EVENT_CONTEXT_TAG,
  applyLiveEventBeaconToEncounterRow,
  resolveLiveEventBeaconForReportingUser,
} from '@/lib/server/resolveLiveEventBeaconAt';
import { emitProximityAtEventOutcome } from '@/lib/server/telemetry/connectionFlowEvents';
import {
  buildVibeContextTags,
  ENCOUNTER_DEBOUNCE_MAX_M,
  EXTENDED_HANGOUT_TAG,
  finiteBatteryPct,
  finiteNumber,
  haversineMeters,
  isEncounterRateLimitError,
  mergeContextTagLists,
  twelveHourUtcBlockId,
  type HandshakeRowLite,
} from '@/lib/server/proximity/matching';
import type { ProximitySensorPayloadJson } from '@/types/supabase-json';
import {
  DISPLAY_LOCATION_FALLBACK,
  nonEmptyPayloadString,
  pendingRowToHandshakeLite,
  sensorPayloadFromRow,
  type BindContext,
  type EncounterMutationOutcome,
} from '@/lib/server/proximity/bindSupport';

export function memberSensorValues(ctx: BindContext, memberId: string): {
  row: HandshakeRowLite | null;
  payload: ProximitySensorPayloadJson;
  lat: number | null;
  lon: number | null;
  lux: number | null;
  motion: number | null;
  azimuth: number | null;
  battery: number | null;
  exactNoiseLevelDb: number | null;
  noiseLevel: string | null;
  exactBarometricElevationM: number | null;
  heightCategory: string | null;
  manualLocationName: string | null;
  weatherSnapshot: string | null;
  contextTags: string[];
} {
  const { uid } = ctx;
  const row =
    memberId === uid
      ? pendingRowToHandshakeLite(ctx.insertedRow)
      : ctx.latestByUser.get(memberId) ?? null;
  const payload = sensorPayloadFromRow(row);
  const latValue = memberId === uid ? ctx.encLat : finiteNumber(row?.lat);
  const lonValue = memberId === uid ? ctx.encLon : finiteNumber(row?.lon);
  return {
    row,
    payload,
    lat: latValue != null && lonValue != null && !(latValue === 0 && lonValue === 0) ? latValue : null,
    lon: latValue != null && lonValue != null && !(latValue === 0 && lonValue === 0) ? lonValue : null,
    lux: memberId === uid ? ctx.selfLux : finiteNumber(row?.lux_level),
    motion: memberId === uid ? ctx.selfMotion : finiteNumber(row?.motion_variance),
    azimuth: memberId === uid ? ctx.selfAz : finiteNumber(row?.compass_azimuth),
    battery: memberId === uid ? ctx.selfBattery : finiteBatteryPct(row?.battery_level),
    exactNoiseLevelDb: memberId === uid ? ctx.exactNoiseLevelDb : finiteNumber(payload.exact_noise_level_db),
    noiseLevel: memberId === uid ? ctx.noiseLevel : nonEmptyPayloadString(payload.noise_level),
    exactBarometricElevationM:
      memberId === uid ? ctx.exactBarometricElevationM : finiteNumber(payload.exact_barometric_elevation_m),
    heightCategory: memberId === uid ? ctx.clientHeightCategory : nonEmptyPayloadString(payload.height_category),
    manualLocationName: memberId === uid ? ctx.manualLocationName : nonEmptyPayloadString(payload.location_name),
    weatherSnapshot: memberId === uid ? ctx.clientWeatherSnapshot : nonEmptyPayloadString(payload.weather_snapshot),
    contextTags: normalizeContextTagsArray(payload.context_tags),
  };
}

export async function buildEncounterRowForMember(
  ctx: BindContext,
  connectionId: string,
  memberId: string,
  encounteredAtIso: string,
): Promise<{ row: Record<string, unknown>; lat: number | null; lon: number | null }> {
  const cacheKey = `${memberId}|${encounteredAtIso}`;
  const cached = ctx.encounterMemberTemplateCache.get(cacheKey);
  if (cached) {
    return {
      row: { ...cached.row, connection_id: connectionId },
      lat: cached.lat,
      lon: cached.lon,
    };
  }
  const values = memberSensorValues(ctx, memberId);
  const otherRows = ctx.memberIds
    .filter((id) => id !== memberId)
    .map((id) => memberSensorValues(ctx, id));
  const avg = (nums: Array<number | null>) => {
    const finite = nums.filter((v): v is number => v != null);
    return finite.length ? finite.reduce((a, b) => a + b, 0) / finite.length : null;
  };
  const memberVibeTags = buildVibeContextTags({
    lux: values.lux,
    selfMotion: values.motion,
    peerMotion: avg(otherRows.map((row) => row.motion)),
    selfAz: values.azimuth,
    peerAz: avg(otherRows.map((row) => row.azimuth)),
    battery: values.battery,
  });
  const memberContextTags = mergeContextTagLists(
    mergeContextTagLists(ctx.clientContextTags, values.contextTags),
    memberVibeTags,
  );

  const memberRelativeAltitudeM: number | null = null;
  const memberDisplayLocation = DISPLAY_LOCATION_FALLBACK;
  const memberSpecificLocationName: string | null = null;
  const memberSemanticLocation: Record<string, unknown> | null = null;

  const row: Record<string, unknown> = {
    connection_id: connectionId,
    encountered_at: encounteredAtIso,
    context_tags: memberContextTags,
    display_location: memberDisplayLocation,
    reporting_user_id: memberId,
  };
  const locationName = values.manualLocationName ?? memberSpecificLocationName;
  if (locationName) row.location_name = locationName;
  if (values.lat != null && values.lon != null) {
    row.gps_lat = values.lat;
    row.gps_lon = values.lon;
  }
  if (memberSemanticLocation != null) row.semantic_location = memberSemanticLocation;
  if (values.noiseLevel != null) row.noise_level = values.noiseLevel;
  if (values.exactNoiseLevelDb != null) row.exact_noise_level_db = values.exactNoiseLevelDb;
  if (values.exactBarometricElevationM != null) row.exact_barometric_elevation_m = values.exactBarometricElevationM;
  if (values.heightCategory != null) row.elevation_category = values.heightCategory;
  if (memberRelativeAltitudeM != null) row.relative_altitude_m = memberRelativeAltitudeM;
  if (values.lux != null) row.lux_level = values.lux;
  if (values.motion != null) row.motion_variance = values.motion;
  if (values.azimuth != null) row.compass_azimuth = values.azimuth;
  if (values.battery != null) row.battery_level = values.battery;

  if (values.weatherSnapshot != null) row.weather_snapshot = values.weatherSnapshot;

  const templateRow = { ...row };
  delete templateRow.connection_id;
  ctx.encounterMemberTemplateCache.set(cacheKey, { row: templateRow, lat: values.lat, lon: values.lon });
  return { row, lat: values.lat, lon: values.lon };
}

export async function insertOrDebounceEncounter(
  admin: SupabaseClient,
  connectionId: string,
  insertRow: Record<string, unknown>,
  encounterLat: number | null,
  encounterLon: number | null,
  reportingUserId?: string | null,
  participantUserIds: string[] = [],
): Promise<EncounterMutationOutcome> {
  if (reportingUserId) {
    insertRow.reporting_user_id = reportingUserId;
  }

  const reportingForEvent =
    typeof reportingUserId === 'string' && reportingUserId.trim()
      ? reportingUserId.trim()
      : null;
  const liveEventAttachment = reportingForEvent
    ? await resolveLiveEventBeaconForReportingUser(
        admin,
        encounterLat,
        encounterLon,
        reportingForEvent,
      ).catch((err) => {
        console.warn('[proximity] live event resolve:', err);
        return null;
      })
    : null;
  void emitProximityAtEventOutcome(admin, {
    attachment: liveEventAttachment,
    latitude: encounterLat,
    longitude: encounterLon,
    participantIds: reportingForEvent ? [reportingForEvent] : [],
    peerCount: participantUserIds.length,
    isGroup: participantUserIds.length > 2,
  });
  insertRow = applyLiveEventBeaconToEncounterRow(insertRow, liveEventAttachment);

  const encounteredAtIso = String(insertRow.encountered_at ?? '');
  const newBlock = twelveHourUtcBlockId(encounteredAtIso);
  if (encounterLat == null || encounterLon == null || newBlock == null) {
    const { error: encErr } = await admin.from('connection_encounters').insert(insertRow);
    if (encErr) {
      if (isEncounterRateLimitError(encErr)) {
        await admin.from('chats').update({ updated_at: Date.now() }).eq('connection_id', connectionId);
        return 'rate_limited';
      }
      console.warn('[proximity] encounter:', encErr.message);
      return 'insert_error';
    }
    return 'inserted';
  }

  let lastEncounterQuery = admin
    .from('connection_encounters')
    .select('id, gps_lat, gps_lon, encountered_at, context_tags, event_beacon_id')
    .eq('connection_id', connectionId);
  if (reportingUserId) {
    lastEncounterQuery = lastEncounterQuery.eq('reporting_user_id', reportingUserId);
  }
  const { data: lastRow, error: lastErr } = await lastEncounterQuery
    .order('encountered_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastErr) {
    console.warn('[proximity] last encounter:', lastErr.message);
  }

  const last = lastRow as {
    id?: string;
    gps_lat?: number | null;
    gps_lon?: number | null;
    encountered_at?: string;
    context_tags?: string[] | null;
    event_beacon_id?: string | null;
  } | null;

  const lastLat = last?.gps_lat != null && Number.isFinite(Number(last.gps_lat)) ? Number(last.gps_lat) : null;
  const lastLon = last?.gps_lon != null && Number.isFinite(Number(last.gps_lon)) ? Number(last.gps_lon) : null;
  const lastAt = typeof last?.encountered_at === 'string' ? last.encountered_at : null;
  const lastBlock = lastAt ? twelveHourUtcBlockId(lastAt) : null;

  const canDebounce =
    last?.id &&
    lastLat != null &&
    lastLon != null &&
    lastBlock != null &&
    lastBlock === newBlock &&
    haversineMeters(encounterLat, encounterLon, lastLat, lastLon) <= ENCOUNTER_DEBOUNCE_MAX_M;

  if (canDebounce && last.id) {
    const prevTags = Array.isArray(last.context_tags) ? [...last.context_tags] : [];
    const merged = [
      ...new Set([
        ...prevTags,
        EXTENDED_HANGOUT_TAG,
        ...(liveEventAttachment ? [AT_EVENT_CONTEXT_TAG] : []),
      ]),
    ];
    const updatePayload: Record<string, unknown> = { context_tags: merged };
    if (liveEventAttachment && !last.event_beacon_id) {
      updatePayload.event_beacon_id = liveEventAttachment.event_beacon_id;
      updatePayload.event_beacon_title = liveEventAttachment.event_beacon_title;
      updatePayload.event_beacon_start_at = liveEventAttachment.event_beacon_start_at;
      updatePayload.event_beacon_end_at = liveEventAttachment.event_beacon_end_at;
    }
    const { error: upErr } = await admin
      .from('connection_encounters')
      .update(updatePayload)
      .eq('id', last.id);
    if (upErr) {
      console.warn('[proximity] encounter debounce update:', upErr.message);
      return 'debounce_update_error';
    }
    return 'debounced';
  }

  const { error: encErr } = await admin.from('connection_encounters').insert(insertRow);
  if (encErr) {
    if (isEncounterRateLimitError(encErr)) {
      await admin.from('chats').update({ updated_at: Date.now() }).eq('connection_id', connectionId);
      return 'rate_limited';
    }
    console.warn('[proximity] encounter:', encErr.message);
    return 'insert_error';
  }
  return 'inserted';
}
