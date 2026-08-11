import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/server/connectionWriteAuth';
import { bindProximityHandshake } from '@/lib/server/proximity/bindProximityHandshake';
import { RECENT_CONNECTION_LOCK_MS, sameMemberSet } from '@/lib/server/proximity/matching';
import { getSupabaseFromRouteRequest } from '@/lib/server/supabaseRouteAuth';
import type { PendingHandshakeRow, ProximityHandshakeRequest, ProximityMatchUserProfile } from '@/types/supabase-json';
import { parseBody } from '@/lib/api/parseBody';
import { proximityHandshakeBodySchema } from '@/lib/api/schemas/connections';

/**
 * POST /api/connections/proximity
 *
 * Async tri-factor proximity bind — replaces bind-proximity-connection Edge Function.
 * Accepts BLE/audio tokens, GPS, and sensor payload. When a peer handshake exists within
 * the 48-hour pending window, forms the connection clique and returns 200. Otherwise
 * stores the payload and returns 202 Accepted (pending_match).
 */
export async function POST(request: NextRequest) {
  try {
    const { user, authError } = await getSupabaseFromRouteRequest(request);
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const parsed = await parseBody(request, proximityHandshakeBodySchema);
    if (!parsed.ok) return parsed.response;
    const body = parsed.data as ProximityHandshakeRequest;

    const admin = createAdminClient();
    const result = await bindProximityHandshake(admin, user.id, body);

    if (result.kind === 'error') {
      return NextResponse.json(result.body, { status: result.status });
    }

    if (result.kind === 'ignored') {
      return NextResponse.json(result.body, { status: result.status });
    }

    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    console.error('[api/connections/proximity]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * GET /api/connections/proximity?pending_handshake_id=...
 *
 * Lets a client that received HTTP 202 recover when another phone later matched the
 * stored row. Re-posting would create a fresh row after the original was consumed.
 */
export async function GET(request: NextRequest) {
  try {
    const { user, authError } = await getSupabaseFromRouteRequest(request);
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const pendingHandshakeId = request.nextUrl.searchParams.get('pending_handshake_id')?.trim() ?? '';
    if (!pendingHandshakeId) {
      return NextResponse.json({ error: 'pending_handshake_id required' }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: row, error: rowErr } = await admin
      .from('pending_handshakes')
      .select('id, user_id, my_token, heard_tokens, lat, lon, lux_level, motion_variance, compass_azimuth, battery_level, sensor_payload, created_at, expires_at, matched_at')
      .eq('id', pendingHandshakeId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (rowErr) {
      console.error('[api/connections/proximity GET] pending lookup:', rowErr.message);
      return NextResponse.json({ error: 'Failed to load pending handshake' }, { status: 500 });
    }
    if (!row) {
      return NextResponse.json({ error: 'Pending handshake not found' }, { status: 404 });
    }

    const pendingRow = row as PendingHandshakeRow;
    if (!pendingRow.matched_at) {
      return NextResponse.json(
        {
          success: true,
          status: 'pending_match',
          pending_handshake_id: pendingRow.id,
          expires_at: pendingRow.expires_at,
          encounter_logged: false,
          matches: [],
        },
        { status: 202 },
      );
    }

    const { data: matchedRows, error: matchedErr } = await admin
      .from('pending_handshakes')
      .select('user_id, matched_at')
      .eq('matched_at', pendingRow.matched_at);

    if (matchedErr) {
      console.error('[api/connections/proximity GET] matched rows:', matchedErr.message);
      return NextResponse.json({ error: 'Failed to load matched handshakes' }, { status: 500 });
    }

    const memberIds = [
      ...new Set(
        (matchedRows ?? [])
          .map((r: { user_id?: unknown }) => (typeof r.user_id === 'string' ? r.user_id : ''))
          .filter((id: string) => id.length > 0),
      ),
    ].sort();

    if (!memberIds.includes(user.id) || memberIds.length < 2) {
      return NextResponse.json({ error: 'Matched handshake is incomplete' }, { status: 409 });
    }

    const { data: connRows, error: connErr } = await admin
      .from('connections')
      .select('id, user_ids, is_group, created, created_utc')
      .contains('user_ids', memberIds);

    if (connErr) {
      console.error('[api/connections/proximity GET] connection lookup:', connErr.message);
      return NextResponse.json({ error: 'Failed to resolve connection' }, { status: 500 });
    }

    const connection = (connRows ?? []).find((candidate: { user_ids?: string[] | null }) =>
      sameMemberSet(candidate.user_ids, memberIds),
    ) as { id?: unknown; user_ids?: string[] | null; is_group?: boolean | null; created?: number | null; created_utc?: string | null } | undefined;

    if (!connection?.id) {
      return NextResponse.json({ error: 'Matched connection not found' }, { status: 404 });
    }

    const ids = memberIds.filter((id) => id !== user.id);
    const { data: users, error: usersErr } = await admin
      .from('users')
      .select('id, name, email, image, created_at:createdAt')
      .in('id', ids);

    if (usersErr) {
      console.error('[api/connections/proximity GET] users:', usersErr.message);
      return NextResponse.json({ error: 'Failed to load user profiles' }, { status: 500 });
    }

    const createdUtcMs =
      typeof connection.created_utc === 'string' ? Date.parse(connection.created_utc) :
        typeof connection.created === 'number' ? connection.created :
          Number.NaN;
    const pendingCreatedMs = Date.parse(pendingRow.created_at);
    const isNewConnection =
      Number.isFinite(createdUtcMs) &&
      Number.isFinite(pendingCreatedMs) &&
      createdUtcMs >= pendingCreatedMs - RECENT_CONNECTION_LOCK_MS;

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
      connection_id: String(connection.id),
      encounter_logged: true,
      is_new_connection: isNewConnection,
      encounter_persisted_on_bind: true,
    }));

    return NextResponse.json({
      success: true,
      encounter_logged: true,
      matches,
      connection_id: String(connection.id),
      is_new_connection: isNewConnection,
      is_group: memberIds.length > 2,
      ...(memberIds.length > 2 ? { group_clique_candidate: { member_user_ids: memberIds } } : {}),
    });
  } catch (error) {
    console.error('[api/connections/proximity GET]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
