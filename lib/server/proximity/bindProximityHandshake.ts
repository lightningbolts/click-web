import type { SupabaseClient } from '@supabase/supabase-js';
import { createCollaborationSessionForConnection } from '@/lib/collaboration/createCollaborationSession';
import {
  finiteBatteryPct,
  finiteNumber,
  handshakeCreatedAtMs,
  normalizeToken,
  PROXIMITY_GROUP_COALESCE_MIN_MS,
  RECENT_CONNECTION_LOCK_MS,
  tokenEvidenceBetweenRows,
} from '@/lib/server/proximity/matching';
import type {
  PendingHandshakeRow,
  ProximityBindOkResponse,
  ProximityHandshakeRequest,
  ProximityMatchUserProfile,
} from '@/types/supabase-json';
import { PENDING_HANDSHAKE_TTL_MS } from '@/types/supabase-json';
import {
  buildSensorPayload,
  markPendingHandshakesMatched,
  PENDING_HANDSHAKE_SELECT,
  sleep,
  USER_PROFILE_SELECT,
  type BindContext,
  type BindResult,
  type EncounterMutationOutcome,
} from '@/lib/server/proximity/bindSupport';
import { loadMatchGraph } from '@/lib/server/proximity/matchGraph';
import {
  ensureConnectionForMemberSet,
  lookupConnectionForMemberSet,
} from '@/lib/server/proximity/connectionEnsure';
import { fireEncounterGeoEnrichment } from '@/lib/server/proximity/encounterEnrichment';
import {
  buildEncounterRowForMember,
  insertOrDebounceEncounter,
  memberSensorValues,
} from '@/lib/server/proximity/encounterPersistence';
import { simulatorProximityMocksEnabled } from '@/lib/server/runtimeEnv';

export async function bindProximityHandshake(
  admin: SupabaseClient,
  uid: string,
  body: ProximityHandshakeRequest,
): Promise<BindResult> {
  const myToken = normalizeToken(body.my_token);
  if (!myToken) {
    return { kind: 'error', status: 400, body: { error: 'Invalid my_token' } };
  }

  const tokenInputs = Array.isArray(body.tokens) ? body.tokens : body.heard_tokens;
  const heardTokens = (Array.isArray(tokenInputs) ? tokenInputs : [])
    .map(normalizeToken)
    .filter((t): t is string => t != null);
  const detectedDevices = (Array.isArray(body.detected_devices) ? body.detected_devices : [])
    .map(normalizeToken)
    .filter((t): t is string => t != null);
  const combinedEvidenceTokens = [...new Set([...heardTokens, ...detectedDevices])];

  if (
    body.simulator_mock === true &&
    simulatorProximityMocksEnabled() &&
    myToken === '1234' &&
    heardTokens.includes('5678')
  ) {
    const connectionId = '00000000-0000-4000-8000-000000000123';
    const mockUserId = '00000000-0000-4000-8000-000000000567';
    return {
      kind: 'ok',
      status: 200,
      body: {
        success: true,
        encounter_logged: true,
        matches: [
          {
            id: mockUserId,
            name: 'Simulator Friend',
            email: 'simulator.friend@click.test',
            image: null,
            created_at: Date.now(),
            connection_id: connectionId,
            encounter_logged: true,
            is_new_connection: false,
            encounter_persisted_on_bind: true,
          },
        ],
        connection_id: connectionId,
        is_new_connection: false,
        is_group: false,
        simulator_mock: true,
        encounter_id: crypto.randomUUID(),
        collaboration_ttl: new Date(Date.now() + 86_400_000).toISOString(),
      },
    };
  }

  const lat = finiteNumber(body.gps_lat) ?? finiteNumber(body.latitude);
  const lon = finiteNumber(body.gps_lon) ?? finiteNumber(body.longitude);
  const selfLux = finiteNumber(body.lux_level);
  const selfMotion = finiteNumber(body.motion_variance);
  const selfAz = finiteNumber(body.compass_azimuth);
  const selfBattery = finiteBatteryPct(body.battery_level);
  const timezoneOffsetMinutes = finiteNumber(body.timezone_offset_minutes) ?? 0;
  const sensorPayload = buildSensorPayload(body, timezoneOffsetMinutes);
  sensorPayload.detected_devices_ble = detectedDevices;
  sensorPayload.heard_tokens_audio = heardTokens;
  const clientContextTags = sensorPayload.context_tags ?? [];
  const exactBarometricElevationM = sensorPayload.exact_barometric_elevation_m ?? null;
  const exactNoiseLevelDb = sensorPayload.exact_noise_level_db ?? null;
  const noiseLevel = sensorPayload.noise_level ?? null;
  const clientHeightCategory = sensorPayload.height_category ?? null;
  const manualLocationName = sensorPayload.location_name ?? null;
  const clientWeatherSnapshot = sensorPayload.weather_snapshot ?? null;

  const nowIso = new Date().toISOString();
  const expiresAtIso = new Date(Date.now() + PENDING_HANDSHAKE_TTL_MS).toISOString();

  // Expired-row cleanup runs on cron (pending-handshakes-cleanup). Request path only
  // replaces this user's unmatched row.

  await admin
    .from('pending_handshakes')
    .delete()
    .eq('user_id', uid)
    .is('matched_at', null);

  const { data: inserted, error: insErr } = await admin
    .from('pending_handshakes')
    .insert({
      user_id: uid,
      my_token: myToken,
      heard_tokens: combinedEvidenceTokens.length > 0 ? combinedEvidenceTokens : heardTokens,
      lat,
      lon,
      lux_level: selfLux,
      motion_variance: selfMotion,
      compass_azimuth: selfAz,
      battery_level: selfBattery,
      sensor_payload: sensorPayload,
      expires_at: expiresAtIso,
    })
    .select(PENDING_HANDSHAKE_SELECT)
    .single();

  if (insErr || !inserted) {
    console.error('[proximity] pending insert:', insErr);
    return { kind: 'error', status: 500, body: { error: 'Failed to record handshake' } };
  }

  const insertedRow = inserted as PendingHandshakeRow;

  if (combinedEvidenceTokens.length === 0) {
    await sleep(PROXIMITY_GROUP_COALESCE_MIN_MS);
  }

  const matchGraphOpts = {
    nowIso,
    callerUserId: uid,
    evidenceTokens: combinedEvidenceTokens.length > 0 ? combinedEvidenceTokens : heardTokens,
    lat,
    lon,
  };

  let graph = await loadMatchGraph(admin, matchGraphOpts);
  if (graph.error) {
    console.error('[proximity] pending query:', graph.error);
    return { kind: 'error', status: 500, body: { error: 'Failed to load peer handshakes' } };
  }

  // Late-joiner re-query: if we already slept for empty evidence, reload immediately;
  // otherwise wait once when the clique is still incomplete (0–1 peers).
  if (graph.matchedIds.size <= 1) {
    if (combinedEvidenceTokens.length > 0) {
      await sleep(PROXIMITY_GROUP_COALESCE_MIN_MS);
    }
    graph = await loadMatchGraph(admin, matchGraphOpts);
    if (graph.error) {
      console.error('[proximity] pending re-query:', graph.error);
      return { kind: 'error', status: 500, body: { error: 'Failed to load peer handshakes' } };
    }
  }

  const { nodeRows, matchedIds, latestByUser } = graph;

  if (matchedIds.size === 0) {
    return {
      kind: 'pending',
      status: 202,
      body: {
        success: true,
        status: 'pending_match',
        pending_handshake_id: insertedRow.id,
        expires_at: insertedRow.expires_at,
        encounter_logged: false,
        matches: [],
      },
    };
  }

  const ids = [...matchedIds].sort();
  const memberIds = [uid, ...ids].sort();
  const recentLockCutoffIso = new Date(Date.now() - RECENT_CONNECTION_LOCK_MS).toISOString();
  const memberNodeRows = nodeRows.filter((row) => memberIds.includes(String(row.user_id)));
  const directTokenEvidenceForPair =
    memberNodeRows.length === 2 &&
    memberNodeRows[0] != null &&
    memberNodeRows[1] != null &&
    tokenEvidenceBetweenRows(memberNodeRows[0], memberNodeRows[1]);
  const insertedCreatedAtMs = handshakeCreatedAtMs(insertedRow);
  if (
    memberIds.length === 2 &&
    !directTokenEvidenceForPair &&
    insertedCreatedAtMs != null &&
    Date.now() - insertedCreatedAtMs < PROXIMITY_GROUP_COALESCE_MIN_MS
  ) {
    return {
      kind: 'pending',
      status: 202,
      body: {
        success: true,
        status: 'pending_match',
        pending_handshake_id: insertedRow.id,
        expires_at: insertedRow.expires_at,
        encounter_logged: false,
        matches: [],
      },
    };
  }

  if (memberIds.length >= 2) {
    const recentConnection = await lookupConnectionForMemberSet(admin, memberIds, recentLockCutoffIso);
    if (recentConnection?.id) {
      const { data: recentUsers, error: recentUsersErr } = await admin
        .from('users')
        .select(USER_PROFILE_SELECT)
        .in('id', ids);
      if (recentUsersErr) {
        console.error('[proximity] users:', recentUsersErr);
        return { kind: 'error', status: 500, body: { error: 'Failed to load user profiles' } };
      }
      const isGroup = memberIds.length > 2;
      const matches: ProximityMatchUserProfile[] = (recentUsers ?? []).map((u: Record<string, unknown>) => ({
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
        connection_id: String(recentConnection.id),
        encounter_logged: true,
        is_new_connection: false,
        encounter_persisted_on_bind: true,
      }));

      await markPendingHandshakesMatched(admin, memberIds, nowIso);

      return {
        kind: 'ok',
        status: 200,
        body: {
          success: true,
          encounter_logged: true,
          matches,
          connection_id: String(recentConnection.id),
          is_new_connection: false,
          is_group: isGroup,
          ...(isGroup ? { group_clique_candidate: { member_user_ids: memberIds } } : {}),
        },
      };
    }
  }

  const encLat = lat != null && lon != null && !(lat === 0 && lon === 0) ? lat : null;
  const encLon = lat != null && lon != null && !(lat === 0 && lon === 0) ? lon : null;

  const ctx: BindContext = {
    admin,
    uid,
    insertedRow,
    latestByUser,
    memberIds,
    encLat,
    encLon,
    selfLux,
    selfMotion,
    selfAz,
    selfBattery,
    exactNoiseLevelDb,
    noiseLevel,
    exactBarometricElevationM,
    clientHeightCategory,
    manualLocationName,
    clientWeatherSnapshot,
    clientContextTags,
    encounterMemberTemplateCache: new Map(),
  };

  type PeerBindMeta = {
    peerId: string;
    connectionId: string | null;
    encounterLogged: boolean;
    isNewConnection: boolean;
    encounterPersistedOnBind: boolean;
    reason?: string;
  };
  const peerEncounterLogged: PeerBindMeta[] = [];
  let handshakeCreatedNewConnection = false;
  let aggregateConnectionId: string | null = null;

  // First-time multi-peer (≥3 members): defer durable create until host confirms selection.
  if (memberIds.length > 2) {
    const existingGroup = await lookupConnectionForMemberSet(admin, memberIds);
    if (!existingGroup?.id) {
      const { data: candidateUsers, error: candidateUsersErr } = await admin
        .from('users')
        .select(USER_PROFILE_SELECT)
        .in('id', ids);
      if (candidateUsersErr) {
        console.error('[proximity] users (awaiting_selection):', candidateUsersErr);
        return { kind: 'error', status: 500, body: { error: 'Failed to load user profiles' } };
      }
      const matches: ProximityMatchUserProfile[] = (candidateUsers ?? []).map((u: Record<string, unknown>) => ({
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
        connection_id: null,
        encounter_logged: false,
        is_new_connection: true,
        encounter_persisted_on_bind: false,
      }));
      return {
        kind: 'ok',
        status: 200,
        body: {
          success: true,
          encounter_logged: false,
          matches,
          awaiting_selection: true,
          pending_handshake_id: insertedRow.id,
          expires_at: insertedRow.expires_at,
          is_group: true,
          is_new_connection: true,
          group_clique_candidate: { member_user_ids: memberIds },
        },
      };
    }
  }

  const ensured = await ensureConnectionForMemberSet(admin, uid, encLat, encLon, memberIds);
  if (!ensured) {
    // Leave pending_handshakes unmatched so GET recovery can retry instead of 404.
    return {
      kind: 'error',
      status: 503,
      body: {
        error: 'connection_unavailable',
        pending_handshake_id: insertedRow.id,
        expires_at: insertedRow.expires_at,
      },
    };
  }

  {
    const { connectionId, isNewConnection } = ensured;
    aggregateConnectionId = connectionId;
    handshakeCreatedNewConnection = isNewConnection;
    const encounteredAtIso = new Date().toISOString();
    let outcome: EncounterMutationOutcome = 'inserted';
    for (const memberId of memberIds) {
      const { row: memberRow, lat: memberLat, lon: memberLon } = await buildEncounterRowForMember(
        ctx,
        connectionId,
        memberId,
        encounteredAtIso,
      );
      const memberOutcome = await insertOrDebounceEncounter(
        admin,
        connectionId,
        memberRow,
        memberLat,
        memberLon,
        memberId,
        memberIds,
      );
      if (memberOutcome === 'inserted' || memberOutcome === 'debounced') {
        const values = memberSensorValues(ctx, memberId);
        fireEncounterGeoEnrichment(
          admin,
          connectionId,
          memberId,
          memberLat,
          memberLon,
          values.exactBarometricElevationM,
          values.manualLocationName,
          values.weatherSnapshot,
        );
      }
      if (memberId === uid) {
        outcome = memberOutcome;
      }
    }
    const directPeerConnectionIds = new Map<string, string>();
    if (memberIds.length > 2) {
      for (let i = 0; i < memberIds.length; i += 1) {
        for (let j = i + 1; j < memberIds.length; j += 1) {
          const pair = [memberIds[i]!, memberIds[j]!].sort();
          const pairEnsured = await ensureConnectionForMemberSet(admin, uid, encLat, encLon, pair, {
            forceActive: true,
          });
          if (!pairEnsured) {
            console.warn('[proximity] pairwise clique connection unavailable:', pair.join(','));
            return {
              kind: 'error',
              status: 503,
              body: {
                error: 'pairwise_connection_unavailable',
                pending_handshake_id: insertedRow.id,
                pair,
              },
            };
          }
          if (pair.includes(uid)) {
            const peerId = pair.find((id) => id !== uid);
            if (peerId) directPeerConnectionIds.set(peerId, pairEnsured.connectionId);
          }
          for (const pairMemberId of pair) {
            const { row: pairMemberRow, lat: pairMemberLat, lon: pairMemberLon } = await buildEncounterRowForMember(
              ctx,
              pairEnsured.connectionId,
              pairMemberId,
              encounteredAtIso,
            );
            await insertOrDebounceEncounter(
              admin,
              pairEnsured.connectionId,
              pairMemberRow,
              pairMemberLat,
              pairMemberLon,
              pairMemberId,
              pair,
            );
            const pairValues = memberSensorValues(ctx, pairMemberId);
            fireEncounterGeoEnrichment(
              admin,
              pairEnsured.connectionId,
              pairMemberId,
              pairMemberLat,
              pairMemberLon,
              pairValues.exactBarometricElevationM,
              pairValues.manualLocationName,
              pairValues.weatherSnapshot,
            );
          }
        }
      }
    }
    const persisted = outcome === 'inserted' || outcome === 'debounced';
    ids.forEach((peerId) => {
      const responseConnectionId = directPeerConnectionIds.get(peerId) ?? connectionId;
      if (outcome === 'rate_limited') {
        peerEncounterLogged.push({
          peerId,
          connectionId: responseConnectionId,
          encounterLogged: false,
          isNewConnection,
          encounterPersistedOnBind: false,
          reason: 'rate_limit_active',
        });
      } else {
        peerEncounterLogged.push({
          peerId,
          connectionId: responseConnectionId,
          encounterLogged: true,
          isNewConnection,
          encounterPersistedOnBind: persisted,
          ...(outcome === 'insert_error' || outcome === 'debounce_update_error'
            ? { reason: 'encounter_mutation_failed' as const }
            : {}),
        });
      }
    });
  }

  await markPendingHandshakesMatched(admin, memberIds, nowIso);

  const aggregateEncounterLogged = peerEncounterLogged.some((p) => p.encounterLogged);

  const { data: users, error: uErr } = await admin
    .from('users')
    .select(USER_PROFILE_SELECT)
    .in('id', ids);

  if (uErr) {
    console.error('[proximity] users:', uErr);
    return { kind: 'error', status: 500, body: { error: 'Failed to load user profiles' } };
  }

  const metaByPeer = new Map(peerEncounterLogged.map((p) => [p.peerId, p]));

  const matches: ProximityMatchUserProfile[] = (users ?? []).map((u: Record<string, unknown>) => {
    const id = String(u.id);
    const meta = metaByPeer.get(id);
    const encounter_logged = meta?.encounterLogged ?? true;
    return {
      id,
      name: (u.name as string | null | undefined) ?? null,
      email: (u.email as string | null | undefined) ?? null,
      image: (u.image as string | null | undefined) ?? null,
      created_at:
        typeof u.created_at === 'string'
          ? Date.parse(u.created_at)
          : typeof u.created_at === 'number'
            ? u.created_at
            : 0,
      connection_id: meta?.connectionId ?? null,
      encounter_logged,
      is_new_connection: meta != null ? meta.isNewConnection : false,
      encounter_persisted_on_bind: meta?.encounterPersistedOnBind ?? false,
      ...(meta?.reason ? { reason: meta.reason } : {}),
    };
  });

  const responseBody: ProximityBindOkResponse = {
    success: true,
    encounter_logged: aggregateEncounterLogged,
    matches,
  };
  const sharedConnectionId = aggregateConnectionId ?? peerEncounterLogged.find((p) => p.connectionId != null)?.connectionId ?? null;
  if (sharedConnectionId != null) {
    responseBody.connection_id = sharedConnectionId;
    responseBody.is_new_connection = handshakeCreatedNewConnection;
    responseBody.is_group = memberIds.length > 2;
  }
  if (memberIds.length > 2) {
    responseBody.group_clique_candidate = { member_user_ids: memberIds };
  }
  if (matches.length === 1 && responseBody.connection_id == null) {
    const only = matches[0];
    if (only?.connection_id != null) {
      responseBody.connection_id = only.connection_id;
      responseBody.is_new_connection = only.is_new_connection;
      responseBody.is_group = false;
    }
  }

  if (sharedConnectionId != null) {
    const participantIds = [...new Set([uid, ...memberIds])].sort();
    const collab = await createCollaborationSessionForConnection(
      admin,
      sharedConnectionId,
      participantIds,
      timezoneOffsetMinutes,
    );
    if (collab) {
      responseBody.encounter_id = collab.encounterId;
      responseBody.collaboration_ttl = collab.collaborationTtl;
    }
  }

  return { kind: 'ok', status: 200, body: responseBody };
}
