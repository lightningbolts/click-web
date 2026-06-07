import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/server/connectionWriteAuth';
import { getSupabaseFromRouteRequest } from '@/lib/server/supabaseRouteAuth';
import { createCollaborationSessionForConnection } from '@/lib/collaboration/createCollaborationSession';

type RouteParams = { params: Promise<{ connectionId: string }> };

/**
 * POST /api/connections/[connectionId]/collaboration-session
 * Opens a Disposable Roll window for any bump (new or reconnect), independent of encounter rate limits.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { connectionId: rawId } = await params;
  const connectionId = rawId?.trim() ?? '';
  if (!connectionId) {
    return NextResponse.json({ error: 'connectionId required' }, { status: 400 });
  }

  const { supabase, user, authError } = await getSupabaseFromRouteRequest(request);
  if (authError != null || user == null) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: connection, error: connErr } = await supabase
    .from('connections')
    .select('id, user_ids')
    .eq('id', connectionId)
    .maybeSingle();

  if (connErr) {
    console.error('[collaboration-session] lookup:', connErr.message);
    return NextResponse.json({ error: 'Failed to resolve connection' }, { status: 500 });
  }
  if (connection?.id == null) {
    return NextResponse.json({ error: 'Connection not found' }, { status: 404 });
  }

  const userIds = Array.isArray(connection.user_ids)
    ? connection.user_ids.filter((id): id is string => typeof id === 'string')
    : [];
  if (!userIds.includes(user.id)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let timezoneOffsetMinutes = 0;
  try {
    const body = (await request.json()) as { timezone_offset_minutes?: unknown };
    if (typeof body.timezone_offset_minutes === 'number' && Number.isFinite(body.timezone_offset_minutes)) {
      timezoneOffsetMinutes = Math.trunc(body.timezone_offset_minutes);
    }
  } catch {
    /* empty body is fine */
  }

  const admin = createAdminClient();
  const created = await createCollaborationSessionForConnection(
    admin,
    connectionId,
    userIds,
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
