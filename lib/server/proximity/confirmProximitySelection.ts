import type { SupabaseClient } from '@supabase/supabase-js';
import { createCollaborationSessionForConnection } from '@/lib/collaboration/createCollaborationSession';
import { normalizeContextTagsArray } from '@/lib/server/connectionEncounterContextTag';
import {
  applyLiveEventBeaconToEncounterRow,
  resolveLiveEventBeaconForReportingUser,
} from '@/lib/server/resolveLiveEventBeaconAt';
import { emitProximityAtEventOutcome } from '@/lib/server/telemetry/connectionFlowEvents';
import {
  bfsComponent,
  buildUserAdjacency,
  buildVibeContextTags,
  ENCOUNTER_DEBOUNCE_MAX_M,
  EXTENDED_HANGOUT_TAG,
  finiteBatteryPct,
  finiteNumber,
  haversineMeters,
  isDuplicateKeyError,
  isEncounterRateLimitError,
  latestHandshakeRowPerUser,
  mergeContextTagLists,
  normalizeToken,
  PENDING_CANDIDATE_BBOX_RADIUS_M,
  PENDING_CANDIDATE_MAX_ROWS,
  peerEvidenceTokens,
  pendingCandidateBBox,
  PROXIMITY_HOST_SELECTION_MAX_MEMBERS,
  sameMemberSet,
  twelveHourUtcBlockId,
  type HandshakeRowLite,
} from '@/lib/server/proximity/matching';
import type {
  PendingHandshakeRow,
  ProximityBindOkResponse,
  ProximityConfirmSelectionRequest,
  ProximityMatchUserProfile,
  ProximitySensorPayloadJson,
} from '@/types/supabase-json';
import { fireEncounterGeoEnrichment } from '@/lib/server/proximity/encounterEnrichment';

const PENDING_HANDSHAKE_SELECT =
  'id, user_id, my_token, heard_tokens, lat, lon, lux_level, motion_variance, compass_azimuth, battery_level, sensor_payload, created_at, expires_at, matched_at';
const USER_PROFILE_SELECT = 'id, name, email, image, created_at:createdAt';

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

function pendingRowToHandshakeLite(row: PendingHandshakeRow): HandshakeRowLite {
  return {
    id: row.id,
    user_id: row.user_id,
    my_token: row.my_token,
    heard_tokens: row.heard_tokens,
    lat: row.lat,
    lon: row.lon,
    created_at: row.created_at,
    lux_level: row.lux_level,
    motion_variance: row.motion_variance,
    compass_azimuth: row.compass_azimuth,
    battery_level: row.battery_level,
    sensor_payload: row.sensor_payload,
  };
}

async function fetchScopedPendingCandidates(
  admin: SupabaseClient,
  opts: {
    nowIso: string;
    callerUserId: string;
    evidenceTokens: string[];
    lat: number | null;
    lon: number | null;
  },
): Promise<PendingHandshakeRow[]> {
  const { nowIso, callerUserId, evidenceTokens, lat, lon } = opts;
  const byId = new Map<string, PendingHandshakeRow>();
  const mergeRows = (data: unknown) => {
    for (const raw of Array.isArray(data) ? data : []) {
      if (!raw || typeof raw !== 'object') continue;
      const row = raw as PendingHandshakeRow;
      if (!row.id) continue;
      byId.set(String(row.id), row);
    }
  };

  const { data: selfRows } = await admin
    .from('pending_handshakes')
    .select(PENDING_HANDSHAKE_SELECT)
    .eq('user_id', callerUserId)
    .gt('expires_at', nowIso)
    .is('matched_at', null)
    .limit(PENDING_CANDIDATE_MAX_ROWS);
  mergeRows(selfRows);

  const tokens = [
    ...new Set(evidenceTokens.map((t) => normalizeToken(t)).filter((t): t is string => t != null)),
  ].slice(0, 32);
  if (tokens.length > 0) {
    const { data: tokenRows } = await admin
      .from('pending_handshakes')
      .select(PENDING_HANDSHAKE_SELECT)
      .gt('expires_at', nowIso)
      .is('matched_at', null)
      .in('my_token', tokens)
      .limit(PENDING_CANDIDATE_MAX_ROWS);
    mergeRows(tokenRows);
  }

  if (lat != null && lon != null && !(lat === 0 && lon === 0)) {
    const box = pendingCandidateBBox(lat, lon, PENDING_CANDIDATE_BBOX_RADIUS_M);
    const { data: geoRows } = await admin
      .from('pending_handshakes')
      .select(PENDING_HANDSHAKE_SELECT)
      .gt('expires_at', nowIso)
      .is('matched_at', null)
      .gte('lat', box.minLat)
      .lte('lat', box.maxLat)
      .gte('lon', box.minLon)
      .lte('lon', box.maxLon)
      .limit(PENDING_CANDIDATE_MAX_ROWS);
    mergeRows(geoRows);
  }

  return [...byId.values()].slice(0, PENDING_CANDIDATE_MAX_ROWS);
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

  const candidates = await fetchScopedPendingCandidates(admin, {
    nowIso,
    callerUserId: uid,
    evidenceTokens,
    lat,
    lon,
  });
  const lites = candidates.map(pendingRowToHandshakeLite);
  const latestByUser = latestHandshakeRowPerUser(lites);
  const nodeRows = [...latestByUser.values()];
  const adj = buildUserAdjacency(nodeRows);
  const component = bfsComponent(uid, adj);

  for (const memberId of selected) {
    if (memberId === uid) continue;
    if (!component.has(memberId)) {
      return {
        kind: 'error',
        status: 400,
        body: { error: 'selected_member_ids includes user not in current handshake component' },
      };
    }
  }

  const memberIds = selected;
  const peerIds = memberIds.filter((id) => id !== uid);

  async function lookupConnectionForMemberSet(
    memberUserIds: string[],
  ): Promise<{ id: string; user_ids: string[] } | null> {
    const { data, error } = await admin
      .from('connections')
      .select('id, user_ids')
      .contains('user_ids', memberUserIds);
    if (error || !data?.length) return null;
    const found = (data as { id: string; user_ids?: string[] }[]).find((r) =>
      sameMemberSet(r.user_ids, memberUserIds),
    );
    return found?.id ? { id: found.id, user_ids: found.user_ids ?? [] } : null;
  }

  async function ensureConnectionForMemberSet(
    memberUserIds: string[],
    options?: { forceActive?: boolean },
  ): Promise<{ connectionId: string; isNewConnection: boolean } | null> {
    const members = [...new Set(memberUserIds)].sort();
    const forceActive = options?.forceActive === true || members.length > 2;
    const existing = await lookupConnectionForMemberSet(members);
    if (existing?.id) {
      if (forceActive) {
        await admin
          .from('connections')
          .update({ status: 'active', expiry_state: 'active' })
          .eq('id', existing.id)
          .eq('status', 'pending');
      }
      return { connectionId: String(existing.id), isNewConnection: false };
    }
    const nowMs = Date.now();
    const expiryMs = nowMs + 30 * 24 * 60 * 60 * 1000;
    const hasGps = lat != null && lon != null && !(lat === 0 && lon === 0);
    const insertRow: Record<string, unknown> = {
      user_ids: members,
      created: nowMs,
      expiry: expiryMs,
      should_continue: members.map(() => false),
      has_begun: false,
      expiry_state: forceActive ? 'active' : 'pending',
      status: forceActive ? 'active' : 'pending',
      include_in_business_insights: true,
      initiator_id: uid,
      responder_id: uid,
      connection_method: 'proximity',
      proximity_confidence: hasGps ? 65 : 50,
      proximity_signals: { method: 'proximity_confirm', member_count: members.length },
      flagged: false,
      is_group: members.length > 2,
      created_utc: new Date(nowMs).toISOString(),
    };
    const { data: inserted, error: insErr } = await admin
      .from('connections')
      .insert(insertRow)
      .select('id')
      .single();
    if (insErr) {
      if (isDuplicateKeyError(insErr)) {
        const retry = await lookupConnectionForMemberSet(members);
        if (retry?.id) return { connectionId: String(retry.id), isNewConnection: false };
      }
      console.error('[proximity/confirm] connection insert:', insErr.message);
      return null;
    }
    const connectionId = String(inserted.id);
    await admin.from('chats').insert({
      connection_id: connectionId,
      updated_at: nowMs,
      created_at: nowMs,
    });
    return { connectionId, isNewConnection: true };
  }

  const clientTags = normalizeContextTagsArray(body.context_tags);
  const sensorPayload = (isRecord(hostRow.sensor_payload) ? hostRow.sensor_payload : {}) as ProximitySensorPayloadJson;

  const ensured = await ensureConnectionForMemberSet(memberIds);
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
      void emitProximityAtEventOutcome(admin, {
        attachment,
        latitude: memberLat,
        longitude: memberLon,
        participantIds: [memberId],
        peerCount: participantIds.length,
        isGroup: participantIds.length > 2,
      });
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
        const pairEnsured = await ensureConnectionForMemberSet(pair, { forceActive: true });
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
