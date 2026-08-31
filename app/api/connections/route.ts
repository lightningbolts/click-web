import { NextRequest, NextResponse } from 'next/server';
import type { ConnectionLifecycleStatus } from '@/types/connection';
import { getSupabaseFromRouteRequest } from '@/lib/server/supabaseRouteAuth';
import { createAdminClient } from '@/lib/server/connectionWriteAuth';
import {
  normalizeContextTag,
  normalizeContextTagsArray,
  normalizeNoiseLevelCategory,
  resolveContextTagId,
} from '@/lib/server/connectionEncounterContextTag';
import { scheduleEventEnrichment } from '@/lib/enrichment/scheduleEventEnrichment';
import { createCollaborationSessionForConnection } from '@/lib/collaboration/createCollaborationSession';
import {
  applyLiveEventBeaconToEncounterRow,
  resolveLiveEventBeaconForReportingUser,
} from '@/lib/server/resolveLiveEventBeaconAt';
import { parseBody } from '@/lib/api/parseBody';
import { connectionsCreateBodySchema, connectionsPatchBodySchema } from '@/lib/api/schemas/connections';
import {
  redactEventFieldsForViewer,
  redactSingleConnectionForViewer,
} from '@/lib/server/connections/redaction';
import {
  DISPLAY_LOCATION_FALLBACK,
  computeProximityScore,
  fetchNominatimReverseGeocode,
  finiteNumber,
  haversineMeters,
  isEncounterRateLimitError,
  isRecord,
  normalizeClientNoiseLevelString,
  normalizeElevationCategoryString,
} from '@/lib/server/connections/geo';
import {
  buildUtcTimeOfDayLabel,
  enrichEncounterRelativeAltitude,
  enrichEncounterWeather,
  type MemoryCapsulePayload,
} from '@/lib/server/connections/encounterEnrichment';
import {
  BUNDLE_PARAM,
  DASHBOARD_ENCOUNTERS_PER_CONNECTION,
  STATUS_SCOPE_PARAM,
  dedupeIds,
  executeActiveConnectionsQuery,
  executeArchivedConnectionsQuery,
  executeMapConnectionsQuery,
  fetchJunctionConnectionIds,
  isInsightsScope,
  isJunctionTableOptionalError,
  parseActiveConnectionsPagination,
  sweepStaleConnectionsForUser,
} from '@/lib/server/connections/queries';

/**
 * Connections API
 *
 * GET    → Fetch connections (`statusScope`: default active | `archived` | `map` = all non-hidden for memory map), or `bundle=dashboard` for active+archived+map in one response
 * POST   → Create a new connection with proximity validation (Layers 2 & 3)
 * DELETE → Per-user hide: insert into `connection_hidden` (no `connections` row delete, no `status = removed`)
 * PATCH  → Restore from archive: delete `connection_archives` row (legacy `status = archived` fallback)
 *
 * Shared helpers live in `lib/server/connections/` (redaction, geo, encounterEnrichment, queries).
 */

// ─── GET — fetch user's connections ──────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const { supabase, user, authError: userError } = await getSupabaseFromRouteRequest(request);
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const insights = isInsightsScope(searchParams);

    const sweep = await sweepStaleConnectionsForUser(supabase, user.id);
    if (!sweep.ok) {
      console.error('[connections GET] sweep_stale_connections_for_user failed:', sweep.message);
      return NextResponse.json({ error: sweep.message }, { status: 400 });
    }

    // Insights: full history — no junction filtering (avoids hiding rows from analytics views).
    if (insights) {
      const { data: connections, error } = await supabase
        .from('connections')
        .select('*, connection_encounters(*)')
        .contains('user_ids', [user.id])
        .order('created', { ascending: false })
        .order('encountered_at', { ascending: false, referencedTable: 'connection_encounters' });

      if (error) {
        console.error('Error fetching connections:', error);
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      const redacted = await redactEventFieldsForViewer(
        user.id,
        (connections ?? []) as Record<string, unknown>[],
      );
      return NextResponse.json({ connections: redacted });
    }

    // Single connection patch (Realtime row refresh without full dashboard bundle).
    const singleConnectionId = searchParams.get('connectionId')?.trim();
    if (singleConnectionId) {
      const { data: connection, error } = await supabase
        .from('connections')
        .select('*, connection_encounters(*)')
        .eq('id', singleConnectionId)
        .contains('user_ids', [user.id])
        .order('encountered_at', { ascending: false, referencedTable: 'connection_encounters' })
        .limit(DASHBOARD_ENCOUNTERS_PER_CONNECTION, { referencedTable: 'connection_encounters' })
        .maybeSingle();

      if (error) {
        console.error('Error fetching connection row:', error);
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      if (!connection) {
        return NextResponse.json({ connection: null }, { status: 404 });
      }
      const redacted = await redactSingleConnectionForViewer(
        user.id,
        connection as Record<string, unknown>,
      );
      return NextResponse.json({ connection: redacted });
    }

    // Dashboard bundle: one sweep + one junction fetch + parallel selects (replaces 3 HTTP calls).
    if (searchParams.get(BUNDLE_PARAM)?.toLowerCase() === 'dashboard') {
      const [archivedForUser, hiddenForUser, coreForUser] = await Promise.all([
        fetchJunctionConnectionIds(supabase, 'connection_archives', user.id),
        fetchJunctionConnectionIds(supabase, 'connection_hidden', user.id),
        fetchJunctionConnectionIds(supabase, 'connection_core', user.id),
      ]);

      const excludedIds = dedupeIds([...archivedForUser, ...hiddenForUser]);
      const hiddenSet = new Set(hiddenForUser);
      const includeArchivedIds = archivedForUser.filter((id) => !hiddenSet.has(id));

      const [activeResult, archivedResult, mapResult] = await Promise.all([
        executeActiveConnectionsQuery(supabase, user.id, excludedIds),
        executeArchivedConnectionsQuery(supabase, user.id, includeArchivedIds),
        executeMapConnectionsQuery(supabase, user.id, hiddenForUser),
      ]);

      if (activeResult.error) {
        console.error('Error fetching connections (bundle active):', activeResult.error);
        return NextResponse.json({ error: activeResult.error.message }, { status: 400 });
      }
      if (archivedResult.error) {
        console.error('Error fetching connections (bundle archived):', archivedResult.error);
        return NextResponse.json({ error: archivedResult.error.message }, { status: 400 });
      }
      if (mapResult.error) {
        console.error('Error fetching connections (bundle map):', mapResult.error);
        return NextResponse.json({ error: mapResult.error.message }, { status: 400 });
      }

      const [active, archived, map] = await Promise.all([
        redactEventFieldsForViewer(user.id, (activeResult.data ?? []) as Record<string, unknown>[]),
        redactEventFieldsForViewer(user.id, (archivedResult.data ?? []) as Record<string, unknown>[]),
        redactEventFieldsForViewer(user.id, (mapResult.data ?? []) as Record<string, unknown>[]),
      ]);

      return NextResponse.json({
        active,
        archived,
        map,
        core: coreForUser,
      });
    }

    const scope = searchParams.get(STATUS_SCOPE_PARAM)?.toLowerCase();

    const [archivedForUser, hiddenForUser] = await Promise.all([
      fetchJunctionConnectionIds(supabase, 'connection_archives', user.id),
      fetchJunctionConnectionIds(supabase, 'connection_hidden', user.id),
    ]);

    // ─── Memory map: every connection the user is on, minus `connection_hidden` only (no archive filter) ───
    if (scope === 'map') {
      const { data: mapConnections, error: mapError } = await executeMapConnectionsQuery(
        supabase,
        user.id,
        hiddenForUser,
      );

      if (mapError) {
        console.error('Error fetching map connections:', mapError);
        return NextResponse.json({ error: mapError.message }, { status: 400 });
      }

      const redacted = await redactEventFieldsForViewer(
        user.id,
        (mapConnections ?? []) as Record<string, unknown>[],
      );
      return NextResponse.json({ connections: redacted });
    }

    // ─── Archived channel: `connection_archives` ids minus `connection_hidden`, then `.in('id', …)` ───
    if (scope === 'archived') {
      const hiddenSet = new Set(hiddenForUser);
      const includeIds = archivedForUser.filter((id) => !hiddenSet.has(id));

      const { data: connections, error } = await executeArchivedConnectionsQuery(
        supabase,
        user.id,
        includeIds,
      );

      if (error) {
        console.error('Error fetching archived connections:', error);
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      const redacted = await redactEventFieldsForViewer(
        user.id,
        (connections ?? []) as Record<string, unknown>[],
      );
      return NextResponse.json({ connections: redacted });
    }

    // ─── Active channel: visible lifecycle states, excluding archived ∪ hidden junction ids ───
    const excludedIds = dedupeIds([...archivedForUser, ...hiddenForUser]);
    const { cursor, limit } = parseActiveConnectionsPagination(searchParams);

    const { data: connections, error } = await executeActiveConnectionsQuery(
      supabase,
      user.id,
      excludedIds,
      cursor,
      limit,
    );

    if (error) {
      console.error('Error fetching connections:', error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const redacted = await redactEventFieldsForViewer(
      user.id,
      (connections ?? []) as Record<string, unknown>[],
    );
    return NextResponse.json({ connections: redacted });
  } catch (error) {
    console.error('Server error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ─── PATCH — restore: remove `connection_archives` row (legacy `status` fallback) ─

type PatchBody = {
  action?: string;
  connectionId?: string;
  id?: string;
};

export async function PATCH(request: NextRequest) {
  try {
    const { user, authError: userError } = await getSupabaseFromRouteRequest(request);
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const parsed = await parseBody(request, connectionsPatchBodySchema);
    if (!parsed.ok) return parsed.response;
    const body = parsed.data as PatchBody;

    if (body.action !== 'restore') {
      return NextResponse.json({ error: 'Unsupported action' }, { status: 400 });
    }

    const connectionId = (body.connectionId ?? body.id)?.trim();
    if (!connectionId) {
      return NextResponse.json({ error: 'connectionId is required' }, { status: 400 });
    }

    const adminClient = createAdminClient();

    const { data: row, error: fetchError } = await adminClient
      .from('connections')
      .select('id, user_ids, status')
      .eq('id', connectionId)
      .maybeSingle();

    if (fetchError) {
      console.error('Connection restore lookup error:', fetchError);
      return NextResponse.json({ error: fetchError.message }, { status: 400 });
    }

    const ids = (row?.user_ids as string[] | null) ?? [];
    if (!row || !ids.includes(user.id)) {
      return NextResponse.json({ error: 'Connection not found' }, { status: 404 });
    }

    const { data: removedArchiveRows, error: archiveDeleteError } = await adminClient
      .from('connection_archives')
      .delete()
      .eq('user_id', user.id)
      .eq('connection_id', connectionId)
      .select('id');

    if (archiveDeleteError && !isJunctionTableOptionalError(archiveDeleteError)) {
      console.error('Connection archive restore error:', archiveDeleteError);
      return NextResponse.json({ error: archiveDeleteError.message }, { status: 400 });
    }

    if ((removedArchiveRows?.length ?? 0) > 0) {
      // Manual unarchive: `kept` shields the row from sweep_stale_connections_for_user (pending/active only).
      const keptStatus: ConnectionLifecycleStatus = 'kept';
      const { data: connection, error: keepUpdateError } = await adminClient
        .from('connections')
        .update({ status: keptStatus })
        .eq('id', connectionId)
        .select()
        .maybeSingle();

      if (keepUpdateError) {
        console.error('Connection unarchive status update error:', keepUpdateError);
        return NextResponse.json({ error: keepUpdateError.message }, { status: 400 });
      }

      return NextResponse.json({ success: true, connection });
    }

    if (row.status === 'archived') {
      const keptStatus: ConnectionLifecycleStatus = 'kept';
      const { data: updated, error: updateError } = await adminClient
        .from('connections')
        .update({ status: keptStatus })
        .eq('id', connectionId)
        .select()
        .maybeSingle();

      if (updateError) {
        console.error('Connection legacy restore error:', updateError);
        return NextResponse.json({ error: updateError.message }, { status: 400 });
      }

      return NextResponse.json({ success: true, connection: updated });
    }

    return NextResponse.json(
      { error: 'Connection is not archived for this user' },
      { status: 409 },
    );
  } catch (error) {
    console.error('Connection PATCH error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ─── DELETE — per-user hide (`connection_hidden`, not `connections` delete) ─

export async function DELETE(request: NextRequest) {
  try {
    const { user, authError: userError } = await getSupabaseFromRouteRequest(request);
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const connectionId =
      request.nextUrl.searchParams.get('connectionId') ??
      request.nextUrl.searchParams.get('id');
    if (!connectionId?.trim()) {
      return NextResponse.json({ error: 'connectionId is required' }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const trimmedId = connectionId.trim();

    const { data: row, error: fetchError } = await adminClient
      .from('connections')
      .select('id, user_ids')
      .eq('id', trimmedId)
      .maybeSingle();

    if (fetchError) {
      console.error('Connection lookup error:', fetchError);
      return NextResponse.json({ error: fetchError.message }, { status: 400 });
    }

    const ids = (row?.user_ids as string[] | null) ?? [];
    if (!row || !ids.includes(user.id)) {
      return NextResponse.json({ error: 'Connection not found' }, { status: 404 });
    }

    const hiddenAt = new Date().toISOString();
    const { error: insertError } = await adminClient
      .from('connection_hidden')
      .upsert(
        {
          user_id: user.id,
          connection_id: trimmedId,
          hidden_at: hiddenAt,
        },
        { onConflict: 'user_id,connection_id' },
      );

    if (!insertError) {
      return NextResponse.json({ success: true, connectionId: trimmedId });
    }

    if (isJunctionTableOptionalError(insertError)) {
      console.error('connection_hidden unavailable:', insertError.message);
      return NextResponse.json(
        { error: 'Hide is not available (database configuration)' },
        { status: 503 },
      );
    }

    console.error('Connection hide error:', insertError);
    return NextResponse.json({ error: insertError.message }, { status: 400 });
  } catch (error) {
    console.error('Connection DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ─── POST — create connection with proximity validation ──────────────────────

export async function POST(request: NextRequest) {
  try {
    const { user, authError: userError } = await getSupabaseFromRouteRequest(request);
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const parsed = await parseBody(request, connectionsCreateBodySchema);
    if (!parsed.ok) return parsed.response;
    const body = parsed.data as Record<string, unknown>;

    const userId1 = typeof body.userId1 === 'string' ? body.userId1 : null;
    const userId2 = typeof body.userId2 === 'string' ? body.userId2 : null;
    const location1 = isRecord(body.location1) ? body.location1 : null;
    const location2 = isRecord(body.location2) ? body.location2 : null;
    const connectionMethod =
      typeof body.connectionMethod === 'string' && body.connectionMethod.trim().length > 0
        ? body.connectionMethod.trim()
        : 'qr';
    const tokenAgeMs = finiteNumber(body.tokenAgeMs);
    const wifiBssid1 = typeof body.wifiBssid1 === 'string' ? body.wifiBssid1 : undefined;
    const wifiBssid2 = typeof body.wifiBssid2 === 'string' ? body.wifiBssid2 : undefined;
    const contextTag = body.contextTag;
    const contextTagObject = body.contextTagObject;
    const initiatorId = body.initiatorId;
    const responderId = body.responderId;
    const initiator_id = body.initiator_id;
    const responder_id = body.responder_id;
    const location_name = body.location_name;
    const noiseLevelCategory = body.noiseLevelCategory ?? body.noise_level_category;
    const heightCategoryRaw = body.height_category ?? body.heightCategory;
    const elevationCategoryRaw = body.elevation_category ?? body.elevationCategory;
    const exactNoiseLevelDb =
      body.exactNoiseLevelDb ??
      body.exact_noise_level_db;
    const exactBarometricElevationMeters =
      body.exactBarometricElevationMeters ??
      body.exact_barometric_elevation_m;
    const clientNoiseLevelString = normalizeClientNoiseLevelString(
      body.noise_level ?? body.noiseLevel,
    );

    // Validate required fields
    if (!userId1 || !userId2) {
      return NextResponse.json({ error: 'Missing userId1 or userId2' }, { status: 400 });
    }

    // Prevent self-connection
    if (userId1 === userId2) {
      return NextResponse.json({ error: 'Cannot connect with yourself' }, { status: 400 });
    }

    const adminClient = createAdminClient();

    // ── Layer 2: GPS proximity validation ──

    const loc1Lat = location1 ? finiteNumber(location1.lat) : null;
    const loc1Lon = location1 ? finiteNumber(location1.lon) : null;
    const loc2Lat = location2 ? finiteNumber(location2.lat) : null;
    const loc2Lon = location2 ? finiteNumber(location2.lon) : null;

    const loc1Valid =
      loc1Lat != null && loc1Lon != null && !(loc1Lat === 0 && loc1Lon === 0);
    const loc2Valid =
      loc2Lat != null && loc2Lon != null && !(loc2Lat === 0 && loc2Lon === 0);

    let gpsDistanceMeters: number | null = null;
    const gpsAvailable = loc1Valid || loc2Valid;

    if (loc1Valid && loc2Valid) {
      gpsDistanceMeters = haversineMeters(loc1Lat, loc1Lon, loc2Lat, loc2Lon);

      // Hard reject if distance > 150m
      if (gpsDistanceMeters > 150) {
        return NextResponse.json({
          error: 'proximity_check_failed',
          distance: Math.round(gpsDistanceMeters),
          message: 'Users appear to be too far apart for a physical connection',
        }, { status: 422 });
      }
    }

    // ── Layer 3: proximity confidence score ──

    const tokenAgeSeconds = tokenAgeMs != null ? tokenAgeMs / 1000 : null;
    const sharedBssid = !!(wifiBssid1 && wifiBssid2 && wifiBssid1 === wifiBssid2);

    const { score: proximityConfidence, signals: proximitySignals } = computeProximityScore({
      connectionMethod,
      gpsDistanceMeters,
      tokenAgeSeconds,
      sharedBssid,
      gpsAvailable,
    });

    const { data: pairCandidates, error: existingErr } = await adminClient
      .from('connections')
      .select('id, status, user_ids, last_message_at, should_continue, has_begun')
      .contains('user_ids', [userId1]);

    if (existingErr) {
      console.error('Connection existing row lookup error:', existingErr);
      return NextResponse.json({ error: existingErr.message }, { status: 500 });
    }

    const existing = (pairCandidates ?? []).find((row) => {
      const ids = (row.user_ids as string[] | null) ?? [];
      return ids.includes(userId1) && ids.includes(userId2);
    }) as
      | {
          id: string;
          status: string | null;
          user_ids: string[];
          last_message_at: number | null;
          should_continue: boolean[] | null;
          has_begun: boolean | null;
        }
      | undefined;

    // Compute geo_location without midpoint averaging to preserve real observed points.
    // If both are available, prefer initiator location1.
    let geoLocation: { lat: number; lon: number };
    if (loc1Valid && loc2Valid) {
      geoLocation = { lat: loc1Lat, lon: loc1Lon };
    } else if (loc1Valid) {
      geoLocation = { lat: loc1Lat, lon: loc1Lon };
    } else if (loc2Valid && loc2Lat != null && loc2Lon != null) {
      geoLocation = { lat: loc2Lat, lon: loc2Lon };
    } else {
      // No GPS available — use a null-island sentinel that the frontend filters out
      geoLocation = { lat: 0, lon: 0 };
    }

    const now = Date.now();
    const createdUtc = new Date(now).toISOString();
    const timeOfDayUtc = buildUtcTimeOfDayLabel(createdUtc);
    const expiry = now + 30 * 24 * 60 * 60 * 1000; // 30 days
    const resolvedContextTag = normalizeContextTag(contextTagObject ?? contextTag);
    const resolvedContextTagId = resolveContextTagId(resolvedContextTag);
    const contextTagIdsFromBody = normalizeContextTagsArray(body.context_tags ?? body.contextTags);
    const enumNoiseLevel = normalizeNoiseLevelCategory(noiseLevelCategory);
    const resolvedNoiseForEncounter =
      enumNoiseLevel ?? clientNoiseLevelString ?? normalizeNoiseLevelCategory(heightCategoryRaw);
    const resolvedElevationCategory =
      normalizeElevationCategoryString(elevationCategoryRaw) ??
      normalizeElevationCategoryString(heightCategoryRaw);
    const resolvedInitiatorId = initiator_id ?? initiatorId ?? (connectionMethod === 'qr' ? userId2 : userId1);
    const resolvedResponderId = responder_id ?? responderId ?? (connectionMethod === 'qr' ? userId1 : userId2);

    const memoryCapsuleBase: Omit<MemoryCapsulePayload, 'connectionId'> = {
      locationName: null,
      geoLocation: geoLocation.lat === 0 && geoLocation.lon === 0 ? null : geoLocation,
      connectedAtMs: now,
      weatherSnapshot: null,
      contextTag: resolvedContextTag,
      photoUri: null,
      noiseLevelCategory: enumNoiseLevel,
    };

    const userIdsForRow = existing?.user_ids ?? [userId1, userId2];

    const sharedConnectionFields = {
      user_ids: userIdsForRow,
      created: now,
      created_utc: createdUtc,
      time_of_day_utc: timeOfDayUtc,
      expiry,
      should_continue:
        existing && Array.isArray(existing.should_continue) && existing.should_continue.length >= 2
          ? existing.should_continue
          : [false, false],
      has_begun: existing?.has_begun === true,
      proximity_confidence: proximityConfidence,
      proximity_signals: proximitySignals,
      connection_method: connectionMethod,
      flagged: proximityConfidence < 20,
      initiator_id: resolvedInitiatorId,
      responder_id: resolvedResponderId,
    };

    const activeLifecycle: ConnectionLifecycleStatus = 'active';

    /** Soft-delete / reconnect: always revive as active + bump timestamps (see unique_user_pair restore path). */
    const restorationConnectionData = {
      ...sharedConnectionFields,
      status: activeLifecycle,
      expiry_state: activeLifecycle,
      last_message_at: now,
    };

    const newConnectionData = {
      ...sharedConnectionFields,
      status: 'pending' as ConnectionLifecycleStatus,
      expiry_state: 'pending' as ConnectionLifecycleStatus,
      should_continue: [false, false] as boolean[],
      has_begun: false,
    };

    let connection: { id: string };
    const reusingExistingPair = !!existing;

    if (existing) {
      const pairIds = (existing.user_ids ?? []).filter((x): x is string => typeof x === 'string' && x.length > 0);
      if (pairIds.length >= 2) {
        const { error: hidDelErr } = await adminClient
          .from('connection_hidden')
          .delete()
          .eq('connection_id', existing.id)
          .in('user_id', pairIds);
        if (hidDelErr && !isJunctionTableOptionalError(hidDelErr)) {
          console.error('connection_hidden clear on restore:', hidDelErr);
        }
        const { error: archDelErr } = await adminClient
          .from('connection_archives')
          .delete()
          .eq('connection_id', existing.id)
          .in('user_id', pairIds);
        if (archDelErr && !isJunctionTableOptionalError(archDelErr)) {
          console.error('connection_archives clear on restore:', archDelErr);
        }
      }

      const { data: updated, error: updateError } = await adminClient
        .from('connections')
        .update(restorationConnectionData)
        .eq('id', existing.id)
        .select()
        .single();

      if (updateError) {
        console.error('Connection restore update error:', updateError);
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }
      connection = updated;
    } else {
      const { data: inserted, error: insertError } = await adminClient
        .from('connections')
        .insert(newConnectionData)
        .select()
        .single();

      if (insertError) {
        console.error('Connection insert error:', insertError);
        return NextResponse.json({ error: insertError.message }, { status: 500 });
      }
      connection = inserted;
    }

    // Existing 1:1 pairs already have a chat row; avoid duplicate chat threads on repeat QR scans.
    if (!reusingExistingPair) {
      const { error: chatError } = await adminClient
        .from('chats')
        .insert({
          connection_id: connection.id,
          created_at: now,
          updated_at: now,
        });

      if (chatError) {
        console.error('Chat creation error (non-fatal):', chatError);
        // Non-fatal — connection was created
      }
    }

    const memoryCapsule: MemoryCapsulePayload = {
      connectionId: connection.id,
      ...memoryCapsuleBase,
    };

    const manualLocationName =
      typeof location_name === 'string' && location_name.trim().length > 0
        ? location_name.trim()
        : null;

    let semanticLocation: Record<string, unknown> | null = null;
    let displayLocation = DISPLAY_LOCATION_FALLBACK;
    let specificLocationName: string | null = null;
    if (
      Number.isFinite(geoLocation.lat) &&
      Number.isFinite(geoLocation.lon) &&
      !(geoLocation.lat === 0 && geoLocation.lon === 0)
    ) {
      const geocoded = await fetchNominatimReverseGeocode(geoLocation.lat, geoLocation.lon);
      semanticLocation = geocoded.semanticLocation;
      displayLocation = geocoded.displayLocation;
      specificLocationName = geocoded.specificLocationName;
    }

    const encounterContextTags = [
      ...new Set([
        ...contextTagIdsFromBody,
        ...(resolvedContextTagId ? [resolvedContextTagId] : []),
      ]),
    ];

    const encounterInsert: Record<string, unknown> = {
      connection_id: connection.id,
      encountered_at: new Date(now).toISOString(),
      display_location: displayLocation,
      context_tags: encounterContextTags,
      weather_snapshot: memoryCapsule.weatherSnapshot,
    };
    if (resolvedNoiseForEncounter != null) {
      encounterInsert.noise_level = resolvedNoiseForEncounter;
    }
    // elevation_category is set later from relative_altitude_m (AGL) via enrichEncounterRelativeAltitude.
    // Do not persist client AMSL-derived categories here.
    const resolvedLocationName = manualLocationName ?? specificLocationName ?? memoryCapsule.locationName;
    if (resolvedLocationName) {
      encounterInsert.location_name = resolvedLocationName;
    }
    if (
      Number.isFinite(geoLocation.lat) &&
      Number.isFinite(geoLocation.lon) &&
      !(geoLocation.lat === 0 && geoLocation.lon === 0)
    ) {
      encounterInsert.gps_lat = geoLocation.lat;
      encounterInsert.gps_lon = geoLocation.lon;
    }
    if (semanticLocation != null) encounterInsert.semantic_location = semanticLocation;

    const encDb = finiteNumber(exactNoiseLevelDb);
    const encElev = finiteNumber(exactBarometricElevationMeters);
    if (encDb != null) {
      encounterInsert.exact_noise_level_db = encDb;
    }
    if (encElev != null) {
      encounterInsert.exact_barometric_elevation_m = encElev;
    }

    const liveEventAttachment = await resolveLiveEventBeaconForReportingUser(
      adminClient,
      Number.isFinite(geoLocation.lat) && !(geoLocation.lat === 0 && geoLocation.lon === 0)
        ? geoLocation.lat
        : null,
      Number.isFinite(geoLocation.lon) && !(geoLocation.lat === 0 && geoLocation.lon === 0)
        ? geoLocation.lon
        : null,
      user.id,
    );
    Object.assign(
      encounterInsert,
      applyLiveEventBeaconToEncounterRow(encounterInsert, liveEventAttachment),
    );

    const { data: insertedEnc, error: encounterErr } = await adminClient
      .from('connection_encounters')
      .insert(encounterInsert)
      .select('id')
      .maybeSingle();
    let encounter_logged = true;
    let encounter_reason: string | undefined;
    if (encounterErr) {
      if (isEncounterRateLimitError(encounterErr)) {
        encounter_logged = false;
        encounter_reason = 'rate_limit_active';
        await adminClient.from('chats').update({ updated_at: now }).eq('connection_id', connection.id);
      } else {
        console.error('connection_encounters insert error:', encounterErr);
      }
    } else if (
      insertedEnc?.id &&
      Number.isFinite(geoLocation.lat) &&
      Number.isFinite(geoLocation.lon) &&
      !(geoLocation.lat === 0 && geoLocation.lon === 0)
    ) {
      scheduleEventEnrichment({
        encounter_id: String(insertedEnc.id),
        lat: geoLocation.lat,
        lon: geoLocation.lon,
        timestamp:
          typeof encounterInsert.encountered_at === 'string'
            ? encounterInsert.encountered_at
            : new Date().toISOString(),
      });
    }

    void enrichEncounterWeather(
      adminClient,
      connection.id,
      geoLocation.lat,
      geoLocation.lon,
      memoryCapsule
    );

    if (
      encElev != null &&
      Number.isFinite(geoLocation.lat) &&
      Number.isFinite(geoLocation.lon) &&
      !(geoLocation.lat === 0 && geoLocation.lon === 0)
    ) {
      void enrichEncounterRelativeAltitude(
        adminClient,
        connection.id,
        encElev,
        geoLocation.lat,
        geoLocation.lon,
      );
    }

    const timezoneOffsetMinutes =
      typeof body.timezone_offset_minutes === 'number' && Number.isFinite(body.timezone_offset_minutes)
        ? Math.trunc(body.timezone_offset_minutes)
        : 0;
    const collabSession = await createCollaborationSessionForConnection(
      adminClient,
      String(connection.id),
      userIdsForRow,
      timezoneOffsetMinutes,
    );

    return NextResponse.json({
      success: true,
      encounter_logged,
      ...(encounter_reason ? { reason: encounter_reason } : {}),
      connection_id: connection.id,
      connection,
      proximityConfidence,
      ...(collabSession
        ? {
            encounter_id: collabSession.encounterId,
            collaboration_ttl: collabSession.collaborationTtl,
          }
        : {}),
    });

  } catch (error) {
    console.error('Connection creation error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
