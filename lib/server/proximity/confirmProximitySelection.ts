import type { SupabaseClient } from '@supabase/supabase-js';
import { runAfterResponse } from '@/lib/server/afterResponse';
import { createCollaborationSessionForConnection } from '@/lib/collaboration/createCollaborationSession';
import { normalizeContextTagsArray } from '@/lib/server/connectionEncounterContextTag';
import {
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
  peerEvidenceTokens,
  PROXIMITY_HOST_SELECTION_MAX_MEMBERS,
  PROXIMITY_LATE_JOIN_WINDOW_MS,
  twelveHourUtcBlockId,
} from '@/lib/server/proximity/matching';
import {
  PENDING_HANDSHAKE_SELECT,
  pendingRowToHandshakeLite,
  USER_PROFILE_SELECT,
} from '@/lib/server/proximity/bindSupport';
import { ensureConnectionForMemberSet } from '@/lib/server/proximity/connectionEnsure';
import { loadMatchGraph } from '@/lib/server/proximity/matchGraph';
import type {
  PendingHandshakeRow,
  ProximityBindOkResponse,
  ProximityConfirmSelectionRequest,
  ProximityMatchUserProfile,
  ProximitySensorPayloadJson,
} from '@/types/supabase-json';
import { fireEncounterGeoEnrichment } from '@/lib/server/proximity/encounterEnrichment';

type ConfirmResult =
  | { kind: 'ok'; status: 200; body: ProximityBindOkResponse }
  | {
      kind: 'error';
      status: number;
      body: { error: string; pending_handshake_id?: string; pair?: string[] };
    };

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Finalize a multi-peer proximity bind after the host selects members + optional context tags.
 */
export async function confirmProximityHandshakeSelection(
  admin: SupabaseClient,
  uid: string,
  body: ProximityConfirmSelectionRequest,
): Promise<ConfirmResult> {
  const pendingId = typeof body.pending_handshake_id === 'string' ? body.pending_handshake_id.trim() : '';
  if (!pendingId) {
    return { kind: 'error', status: 400, body: { error: 'pending_handshake_id required' } };
  }

  const rawSelected = Array.isArray(body.selected_member_ids) ? body.selected_member_ids : [];
  const selected = [
    ...new Set(
      rawSelected
        .map((id) => (typeof id === 'string' ? id.trim() : ''))
        .filter((id) => id.length > 0),
    ),
  ];
  if (!selected.includes(uid)) selected.push(uid);
  selected.sort();

  if (selected.length < 2) {
    return { kind: 'error', status: 400, body: { error: 'selected_member_ids must include at least one peer' } };
  }
  if (selected.length > PROXIMITY_HOST_SELECTION_MAX_MEMBERS) {
    return {
      kind: 'error',
      status: 400,
      body: { error: `selected_member_ids exceeds max of ${PROXIMITY_HOST_SELECTION_MAX_MEMBERS}` },
    };
  }

  const nowIso = new Date().toISOString();
  const { data: pendingRow, error: pendingErr } = await admin
    .from('pending_handshakes')
    .select(PENDING_HANDSHAKE_SELECT)
    .eq('id', pendingId)
    .eq('user_id', uid)
    .maybeSingle();

  if (pendingErr) {
    console.error('[proximity/confirm] pending lookup:', pendingErr.message);
    return { kind: 'error', status: 500, body: { error: 'Failed to load pending handshake' } };
  }
  if (!pendingRow) {
    return { kind: 'error', status: 404, body: { error: 'Pending handshake not found' } };
  }
  const hostRow = pendingRow as PendingHandshakeRow;
  if (hostRow.matched_at != null) {
    return { kind: 'error', status: 409, body: { error: 'Handshake already finalized' } };
  }

  const evidenceTokens = [
    ...peerEvidenceTokens(pendingRowToHandshakeLite(hostRow)),
    ...((Array.isArray(hostRow.heard_tokens) ? hostRow.heard_tokens : []) as string[]),
  ];
  const lat = finiteNumber(hostRow.lat);
  const lon = finiteNumber(hostRow.lon);

  const createdMs = Date.parse(hostRow.created_at);
  const graph = await loadMatchGraph(admin, {
    nowIso,
    callerUserId: uid,
    evidenceTokens,
    lat,
    lon,
    // Peers matched shortly before the host tapped (late join) are still selectable.
    matchedSinceIso: new Date(
      (Number.isFinite(createdMs) ? createdMs : Date.now()) - PROXIMITY_LATE_JOIN_WINDOW_MS,
    ).toISOString(),
  });
  if (graph.error) {
    console.error('[proximity/confirm] pending query:', graph.error);
    return { kind: 'error', status: 500, body: { error: 'Failed to load peer handshakes' } };
  }
  const { latestByUser, matchedIds } = graph;

  for (const memberId of selected) {
    if (memberId === uid) continue;
    if (!matchedIds.has(memberId)) {
      return {
        kind: 'error',
        status: 400,
        body: { error: 'selected_member_ids includes user not in current handshake component' },
      };
    }
  }

  const memberIds = selected;
  const peerIds = memberIds.filter((id) => id !== uid);

  const clientTags = normalizeContextTagsArray(body.context_tags);
  const sensorPayload = (isRecord(hostRow.sensor_payload) ? hostRow.sensor_payload : {}) as ProximitySensorPayloadJson;

  const encLat = lat != null && lon != null && !(lat === 0 && lon === 0) ? lat : null;
  const encLon = encLat != null ? lon : null;
  const ensured = await ensureConnectionForMemberSet(admin, uid, encLat, encLon, memberIds);
  if (!ensured) {
    return {
      kind: 'error',
      status: 503,
      body: { error: 'connection_unavailable', pending_handshake_id: pendingId },
    };
  }

  const { connectionId, isNewConnection } = ensured;
  const encounteredAtIso = new Date().toISOString();
  let aggregateEncounterLogged = false;
  let atEventTelemetryEmitted = false;

  async function insertEncounterForMember(
    connId: string,
    memberId: string,
    participantIds: string[],
  ): Promise<boolean> {
    const memberLite = latestByUser.get(memberId);
    const memberLat = finiteNumber(memberLite?.lat) ?? lat;
    const memberLon = finiteNumber(memberLite?.lon) ?? lon;
    const memberPayload = (
      isRecord(memberLite?.sensor_payload) ? memberLite!.sensor_payload : {}
    ) as ProximitySensorPayloadJson;
    const memberBaro =
      finiteNumber(memberPayload.exact_barometric_elevation_m) ??
      finiteNumber(sensorPayload.exact_barometric_elevation_m);
    const memberLocationName =
      (typeof memberPayload.location_name === 'string' && memberPayload.location_name.trim()) ||
      (typeof sensorPayload.location_name === 'string' && sensorPayload.location_name.trim()) ||
      null;
    const memberWeather =
      (typeof memberPayload.weather_snapshot === 'string' && memberPayload.weather_snapshot.trim()) ||
      (typeof sensorPayload.weather_snapshot === 'string' && sensorPayload.weather_snapshot.trim()) ||
      null;
    const fireGeo = () => {
      fireEncounterGeoEnrichment(
        admin,
        connId,
        memberId,
        memberLat,
        memberLon,
        memberBaro,
        memberLocationName,
        memberWeather,
      );
    };
    const vibeTags = buildVibeContextTags({
      lux: finiteNumber(memberLite?.lux_level) ?? finiteNumber(hostRow.lux_level),
      selfMotion: finiteNumber(hostRow.motion_variance),
      peerMotion: finiteNumber(memberLite?.motion_variance),
      selfAz: finiteNumber(hostRow.compass_azimuth),
      peerAz: finiteNumber(memberLite?.compass_azimuth),
      battery: finiteBatteryPct(memberLite?.battery_level) ?? finiteBatteryPct(hostRow.battery_level),
    });
    const tags = mergeContextTagLists(clientTags, vibeTags);
    let insertRow: Record<string, unknown> = {
      connection_id: connId,
      reporting_user_id: memberId,
      encountered_at: encounteredAtIso,
      gps_lat: memberLat,
      gps_lon: memberLon,
      context_tags: tags,
      lux_level: finiteNumber(memberLite?.lux_level),
      motion_variance: finiteNumber(memberLite?.motion_variance),
      compass_azimuth: finiteNumber(memberLite?.compass_azimuth),
      battery_level: finiteBatteryPct(memberLite?.battery_level),
      noise_level: sensorPayload.noise_level ?? null,
      exact_noise_level_db: sensorPayload.exact_noise_level_db ?? null,
      elevation_category: sensorPayload.height_category ?? null,
      exact_barometric_elevation_m: sensorPayload.exact_barometric_elevation_m ?? null,
    };
    const attachment = await resolveLiveEventBeaconForReportingUser(
      admin,
      memberLat,
      memberLon,
      memberId,
    );
    if (!atEventTelemetryEmitted) {
      atEventTelemetryEmitted = true;
      runAfterResponse('proximity at-event telemetry', () =>
        emitProximityAtEventOutcome(admin, {
          attachment,
          latitude: memberLat,
          longitude: memberLon,
          participantIds: [memberId],
          peerCount: participantIds.length,
          isGroup: participantIds.length > 2,
        }),
      );
    }
    insertRow = applyLiveEventBeaconToEncounterRow(insertRow, attachment);

    const { data: recent } = await admin
      .from('connection_encounters')
      .select('id, gps_lat, gps_lon, context_tags, encountered_at, event_beacon_id')
      .eq('connection_id', connId)
      .eq('reporting_user_id', memberId)
      .order('encountered_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (recent?.id && recent.encountered_at) {
      const recentAtIso = String(recent.encountered_at);
      const recentMs = Date.parse(recentAtIso);
      const nowMs = Date.parse(encounteredAtIso);
      if (
        Number.isFinite(recentMs) &&
        Number.isFinite(nowMs) &&
        twelveHourUtcBlockId(recentAtIso) === twelveHourUtcBlockId(encounteredAtIso)
      ) {
        const rLat = finiteNumber(recent.gps_lat);
        const rLon = finiteNumber(recent.gps_lon);
        if (
          memberLat != null &&
          memberLon != null &&
          rLat != null &&
          rLon != null &&
          haversineMeters(memberLat, memberLon, rLat, rLon) <= ENCOUNTER_DEBOUNCE_MAX_M
        ) {
          const prevTags = Array.isArray(recent.context_tags)
            ? recent.context_tags.filter((t): t is string => typeof t === 'string')
            : [];
          const merged = mergeContextTagLists(prevTags, [...tags, EXTENDED_HANGOUT_TAG]);
          const patch: Record<string, unknown> = { context_tags: merged };
          if (!recent.event_beacon_id && attachment) {
            Object.assign(patch, {
              event_beacon_id: attachment.event_beacon_id,
              event_beacon_title: attachment.event_beacon_title,
              event_beacon_start_at: attachment.event_beacon_start_at,
              event_beacon_end_at: attachment.event_beacon_end_at,
            });
          }
          await admin.from('connection_encounters').update(patch).eq('id', recent.id);
          fireGeo();
          return true;
        }
      }
    }

    const { error: encErr } = await admin.from('connection_encounters').insert(insertRow);
    if (encErr) {
      if (isEncounterRateLimitError(encErr)) return false;
      console.warn('[proximity/confirm] encounter:', encErr.message);
      return false;
    }
    fireGeo();
    return true;
  }

  for (const memberId of memberIds) {
    const ok = await insertEncounterForMember(connectionId, memberId, memberIds);
    if (ok) aggregateEncounterLogged = true;
  }

  if (memberIds.length > 2) {
    for (let i = 0; i < memberIds.length; i += 1) {
      for (let j = i + 1; j < memberIds.length; j += 1) {
        const pair = [memberIds[i]!, memberIds[j]!].sort();
        const pairEnsured = await ensureConnectionForMemberSet(admin, uid, encLat, encLon, pair, {
          forceActive: true,
        });
        if (!pairEnsured) {
          return {
            kind: 'error',
            status: 503,
            body: {
              error: 'pairwise_connection_unavailable',
              pending_handshake_id: pendingId,
              pair,
            },
          };
        }
        for (const pairMemberId of pair) {
          await insertEncounterForMember(pairEnsured.connectionId, pairMemberId, pair);
        }
      }
    }
  }

  await admin
    .from('pending_handshakes')
    .update({ matched_at: nowIso })
    .in('user_id', memberIds)
    .is('matched_at', null);

  const { data: users, error: uErr } = await admin
    .from('users')
    .select(USER_PROFILE_SELECT)
    .in('id', peerIds);
  if (uErr) {
    return { kind: 'error', status: 500, body: { error: 'Failed to load user profiles' } };
  }

  const matches: ProximityMatchUserProfile[] = (users ?? []).map((u: Record<string, unknown>) => ({
    id: String(u.id),
    name: (u.name as string | null | undefined) ?? null,
    email: (u.email as string | null | undefined) ?? null,
    image: (u.image as string | null | undefined) ?? null,
    created_at:
      typeof u.created_at === 'string'
        ? Date.parse(u.created_at)
        : typeof u.created_at === 'number'
          ? u.created_at
          : 0,
    connection_id: connectionId,
    encounter_logged: aggregateEncounterLogged,
    is_new_connection: isNewConnection,
    encounter_persisted_on_bind: aggregateEncounterLogged,
  }));

  const responseBody: ProximityBindOkResponse = {
    success: true,
    encounter_logged: aggregateEncounterLogged,
    matches,
    connection_id: connectionId,
    is_new_connection: isNewConnection,
    is_group: memberIds.length > 2,
  };
  if (memberIds.length > 2) {
    responseBody.group_clique_candidate = { member_user_ids: memberIds };
  }

  const collab = await createCollaborationSessionForConnection(
    admin,
    connectionId,
    memberIds,
    finiteNumber(sensorPayload.timezone_offset_minutes) ?? 0,
  );
  if (collab) {
    responseBody.encounter_id = collab.encounterId;
    responseBody.collaboration_ttl = collab.collaborationTtl;
  }

  return { kind: 'ok', status: 200, body: responseBody };
}
