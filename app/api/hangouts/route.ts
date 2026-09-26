/**
 * Hangouts logged without a tap (they reach the timeline once both people confirm).
 *
 * GET  /api/hangouts                 → { hangouts: [...] } pending ones you're part of
 * POST /api/hangouts                 → log one: { connection_id, occurred_at?, lat?, lon?, location_name? }
 *                                      You're pre-confirmed; the other person is asked.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseFromRouteRequest } from '@/lib/server/supabaseRouteAuth';
import { parseBody } from '@/lib/api/parseBody';
import { hangoutLogBodySchema } from '@/lib/api/schemas/connections';
import { createAdminClient } from '@/lib/server/connectionWriteAuth';
import { createHangout, isValidCoordinate, MAX_BACKDATE_MS, pairConnection, serializeHangout, type HangoutRow } from '@/lib/hangouts/hangouts';
import { userPushContext } from '@/lib/nudges/moments';

export async function GET(request: NextRequest) {
  const { user, authError } = await getSupabaseFromRouteRequest(request);
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data, error } = await createAdminClient()
    .from('hangout_confirmations')
    .select('id, connection_id, user_ids, confirmed_user_ids, source, requested_by, occurred_at, gps_lat, gps_lon, location_name, status, encounter_id, expires_at')
    .contains('user_ids', [user.id])
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ hangouts: ((data ?? []) as HangoutRow[]).map((row) => serializeHangout(row, user.id)) });
}

export async function POST(request: NextRequest) {
  const { user, authError } = await getSupabaseFromRouteRequest(request);
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const parsed = await parseBody(request, hangoutLogBodySchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data as Record<string, unknown>;
  const connectionId = typeof body.connection_id === 'string' ? body.connection_id.trim() : '';
  if (!connectionId) return NextResponse.json({ error: 'connection_id is required' }, { status: 400 });

  const now = Date.now();
  const occurredMs = typeof body.occurred_at === 'string' ? Date.parse(body.occurred_at) : now;
  if (!Number.isFinite(occurredMs) || occurredMs > now + 5 * 60 * 1000 || occurredMs < now - MAX_BACKDATE_MS) {
    return NextResponse.json({ error: 'occurred_at must be within the last 7 days' }, { status: 400 });
  }
  const hasCoords = isValidCoordinate(body.lat, body.lon);
  const locationName =
    typeof body.location_name === 'string' && body.location_name.trim() ? body.location_name.trim().slice(0, 120) : null;

  const admin = createAdminClient();
  const connection = await pairConnection(admin, connectionId, user.id);
  if (!connection) return NextResponse.json({ error: 'Connection not found' }, { status: 404 });

  // One open request per pair at a time.
  const { count } = await admin
    .from('hangout_confirmations')
    .select('id', { count: 'exact', head: true })
    .eq('connection_id', connectionId)
    .eq('status', 'pending')
    .gt('expires_at', new Date(now).toISOString());
  if ((count ?? 0) > 0) {
    return NextResponse.json({ error: 'A hangout is already waiting to be confirmed', code: 'pending_exists' }, { status: 409 });
  }

  const hangout = await createHangout(
    admin,
    {
      connection,
      source: 'manual',
      requestedBy: user.id,
      occurredAt: new Date(occurredMs),
      lat: hasCoords ? (body.lat as number) : null,
      lon: hasCoords ? (body.lon as number) : null,
      locationName,
    },
    userPushContext(),
  );
  if (!hangout) return NextResponse.json({ error: 'Failed to log hangout' }, { status: 500 });
  return NextResponse.json({ hangout: serializeHangout(hangout, user.id) }, { status: 201 });
}
