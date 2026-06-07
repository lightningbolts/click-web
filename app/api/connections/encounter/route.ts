/**
 * POST /api/connections/encounter
 * Lightweight encounter log: inserts `connection_encounters` only (no `connections` writes).
 * Body: { user_id, peer_id, sensor_data? }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseFromRouteRequest } from '@/lib/server/supabaseRouteAuth';
import { createAdminClient } from '@/lib/server/connectionWriteAuth';
import { createCollaborationSessionForConnection } from '@/lib/collaboration/createCollaborationSession';
import { buildEncounterInsertFromSensor } from '@/lib/connections/encounterSensorPayload';
import { scheduleEventEnrichment } from '@/lib/enrichment/scheduleEventEnrichment';

function isUuidLike(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function isEncounterRateLimitError(err: { message?: string; details?: string; hint?: string } | null): boolean {
  if (!err) return false;
  const combined = [
    err.message ?? '',
    err.details ?? '',
    err.hint ?? '',
  ].join(' ');
  return combined.includes('encounter_rate_limit_3h');
}

type ConnectionRow = { id: string; user_ids?: string[] | null };

function pickPairwiseConnection(rows: ConnectionRow[] | null, selfId: string, peerId: string): string | null {
  if (!rows?.length) return null;
  const pair = new Set([selfId, peerId]);
  for (const row of rows) {
    const ids = row.user_ids ?? [];
    if (ids.length !== 2) continue;
    const a = String(ids[0] ?? '').trim();
    const b = String(ids[1] ?? '').trim();
    if (!pair.has(a) || !pair.has(b)) continue;
    return String(row.id);
  }
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, user, authError } = await getSupabaseFromRouteRequest(request);
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    if (body === null || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Body must be a JSON object' }, { status: 400 });
    }

    const raw = body as Record<string, unknown>;
    const openDisposableRoll = raw.open_disposable_roll === true;
    const connectionIdDirect =
      typeof raw.connection_id === 'string' ? raw.connection_id.trim() : '';

    if (openDisposableRoll) {
      if (!connectionIdDirect || !isUuidLike(connectionIdDirect)) {
        return NextResponse.json({ error: 'connection_id required' }, { status: 400 });
      }

      const { data: rollConn, error: rollConnErr } = await supabase
        .from('connections')
        .select('id, user_ids')
        .eq('id', connectionIdDirect)
        .maybeSingle();

      if (rollConnErr) {
        console.error('connections/encounter roll connection lookup:', rollConnErr.message);
        return NextResponse.json({ error: 'Failed to resolve connection' }, { status: 500 });
      }
      if (rollConn?.id == null) {
        return NextResponse.json({ error: 'Connection not found' }, { status: 404 });
      }

      const rollUserIds = Array.isArray(rollConn.user_ids)
        ? rollConn.user_ids.filter((id): id is string => typeof id === 'string')
        : [];
      if (!rollUserIds.includes(user.id)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      let timezoneOffsetMinutes = 0;
      if (typeof raw.timezone_offset_minutes === 'number' && Number.isFinite(raw.timezone_offset_minutes)) {
        timezoneOffsetMinutes = Math.trunc(raw.timezone_offset_minutes);
      }

      const admin = createAdminClient();
      const created = await createCollaborationSessionForConnection(
        admin,
        connectionIdDirect,
        rollUserIds,
        timezoneOffsetMinutes,
      );

      if (created == null) {
        return NextResponse.json({ error: 'Failed to open collaboration session' }, { status: 500 });
      }

      return NextResponse.json({
        ok: true,
        encounter_id: created.encounterId,
        collaboration_ttl: created.collaborationTtl,
      });
    }

    const userId = typeof raw.user_id === 'string' ? raw.user_id.trim() : '';
    const peerId = typeof raw.peer_id === 'string' ? raw.peer_id.trim() : '';
    const sensorData = raw.sensor_data;

    if (!userId || !peerId) {
      return NextResponse.json({ error: 'user_id and peer_id are required' }, { status: 400 });
    }
    if (!isUuidLike(userId) || !isUuidLike(peerId)) {
      return NextResponse.json({ error: 'user_id and peer_id must be UUIDs' }, { status: 400 });
    }
    if (userId !== user.id) {
      return NextResponse.json({ error: 'user_id must match the authenticated user' }, { status: 403 });
    }
    if (peerId === userId) {
      return NextResponse.json({ error: 'peer_id must differ from user_id' }, { status: 400 });
    }

    const { data: connRows, error: connErr } = await supabase
      .from('connections')
      .select('id, user_ids')
      .contains('user_ids', [userId, peerId]);

    if (connErr) {
      console.error('connections/encounter connection lookup:', connErr.message);
      return NextResponse.json({ error: 'Failed to resolve connection' }, { status: 500 });
    }

    const connectionId = pickPairwiseConnection((connRows ?? []) as ConnectionRow[], userId, peerId);
    if (!connectionId) {
      return NextResponse.json({ error: 'No pairwise connection found for this pair' }, { status: 404 });
    }

    const insertRow = buildEncounterInsertFromSensor(connectionId, sensorData);

    const { data: inserted, error: insErr } = await supabase
      .from('connection_encounters')
      .insert(insertRow)
      .select('id')
      .maybeSingle();

    if (insErr) {
      const msg = insErr.message ?? '';
      if (isEncounterRateLimitError(insErr)) {
        return NextResponse.json(
          {
            success: false,
            encounter_id: null,
            rate_limited: true,
            message: 'Encounter rate limit active (3h server window).',
          },
          { status: 429 },
        );
      }
      console.error('connections/encounter insert:', msg);
      return NextResponse.json({ error: 'Failed to record encounter' }, { status: 500 });
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
    }

    return NextResponse.json({
      success: true,
      encounter_id: encounterId,
      connection_id: connectionId,
      rate_limited: false,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unexpected error';
    console.error('connections/encounter error:', msg);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
