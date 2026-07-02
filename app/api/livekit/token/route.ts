import { NextRequest, NextResponse } from 'next/server';
import { AccessToken } from 'livekit-server-sdk';
import { getSupabaseFromRouteRequest } from '@/lib/server/supabaseRouteAuth';
import { createAdminClient } from '@/lib/server/connectionWriteAuth';
import { isActiveChatListStatus, normalizeConnectionStatus } from '@/lib/dashboard/connectionStatus';

/** Group voice/video rooms cap at eight participants (caller + up to seven others). */
const MAX_GROUP_CALL_PARTICIPANTS = 8;

type LiveKitTokenRequestBody = {
  connection_id?: unknown;
  group_id?: unknown;
  room_name?: unknown;
  participant_name?: unknown;
};

export type LiveKitTokenSuccessResponse = {
  token: string;
  ws_url: string;
};

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

/**
 * True if there is any block between [userId] and [peerId] (either direction).
 */
async function isPairBlocked(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  peerId: string,
): Promise<boolean> {
  const { data: a, error: errA } = await admin
    .from('user_blocks')
    .select('id')
    .eq('blocker_id', userId)
    .eq('blocked_id', peerId)
    .maybeSingle();
  if (errA) return true;
  if (a) return true;
  const { data: b, error: errB } = await admin
    .from('user_blocks')
    .select('id')
    .eq('blocker_id', peerId)
    .eq('blocked_id', userId)
    .maybeSingle();
  if (errB) return true;
  return Boolean(b);
}

/**
 * POST /api/livekit/token
 *
 * Body: { connection_id?, group_id?, room_name, participant_name }
 * — 1:1: [room_name] must be `click-{connection_id}-{suffix}`; verifies connection membership.
 * — Group: optional [group_id]; [room_name] must be `click-group-{groupId}-{suffix}`; verifies
 *   group_members, block checks vs each member, max [MAX_GROUP_CALL_PARTICIPANTS] members.
 */
export async function POST(request: NextRequest) {
  const { user, authError } = await getSupabaseFromRouteRequest(request);
  if (authError != null || user == null) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: LiveKitTokenRequestBody;
  try {
    body = (await request.json()) as LiveKitTokenRequestBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const connectionId = isNonEmptyString(body.connection_id) ? body.connection_id.trim() : '';
  const groupId = isNonEmptyString(body.group_id) ? body.group_id.trim() : '';
  const roomName = isNonEmptyString(body.room_name) ? body.room_name.trim() : '';
  const participantName = isNonEmptyString(body.participant_name)
    ? body.participant_name.trim()
    : user.email?.split('@')[0] ?? 'Click user';

  if (!roomName) {
    return NextResponse.json({ error: 'room_name is required' }, { status: 400 });
  }

  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const wsUrl = process.env.LIVEKIT_WS_URL || process.env.LIVEKIT_URL;

  if (!apiKey || !apiSecret || !wsUrl) {
    return NextResponse.json({ error: 'LiveKit environment is not configured' }, { status: 500 });
  }

  const admin = createAdminClient();

  if (groupId) {
    const expectedGroupPrefix = `click-group-${groupId}-`;
    if (!roomName.startsWith(expectedGroupPrefix)) {
      return NextResponse.json({ error: 'room_name does not match group_id' }, { status: 400 });
    }

    const { data: membership, error: memberErr } = await admin
      .from('group_members')
      .select('user_id')
      .eq('group_id', groupId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (memberErr) {
      console.error('[livekit/token] group membership lookup:', memberErr.message);
      return NextResponse.json({ error: memberErr.message }, { status: 400 });
    }
    if (!membership) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    }

    const { data: memberRows, error: membersErr } = await admin
      .from('group_members')
      .select('user_id')
      .eq('group_id', groupId);

    if (membersErr) {
      console.error('[livekit/token] group members lookup:', membersErr.message);
      return NextResponse.json({ error: membersErr.message }, { status: 400 });
    }

    const memberIds = (memberRows ?? [])
      .map((row) => (typeof row.user_id === 'string' ? row.user_id.trim() : ''))
      .filter((id) => id.length > 0);

    if (memberIds.length === 0 || !memberIds.includes(user.id)) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    }
    if (memberIds.length > MAX_GROUP_CALL_PARTICIPANTS) {
      return NextResponse.json({ error: 'Group exceeds maximum call size' }, { status: 403 });
    }

    for (const peerId of memberIds) {
      if (peerId === user.id) continue;
      const blocked = await isPairBlocked(admin, user.id, peerId);
      if (blocked) {
        return NextResponse.json({ error: 'Call blocked' }, { status: 403 });
      }
    }
  } else {
    if (!connectionId) {
      return NextResponse.json(
        { error: 'connection_id and room_name are required' },
        { status: 400 },
      );
    }

    const expectedPrefix = `click-${connectionId}-`;
    if (!roomName.startsWith(expectedPrefix)) {
      return NextResponse.json({ error: 'room_name does not match connection_id' }, { status: 400 });
    }

    const { data: row, error: fetchError } = await admin
      .from('connections')
      .select('id, user_ids, status, expiry_state')
      .eq('id', connectionId)
      .maybeSingle();

    if (fetchError) {
      console.error('[livekit/token] connection lookup:', fetchError.message);
      return NextResponse.json({ error: fetchError.message }, { status: 400 });
    }

    const participantIds =
      (row?.user_ids as string[] | null)?.map((id) => id.trim()).filter((id) => id.length > 0) ?? [];
    if (!row || participantIds.length === 0 || !participantIds.includes(user.id)) {
      return NextResponse.json({ error: 'Connection not found' }, { status: 404 });
    }

    const st = normalizeConnectionStatus(row as Record<string, unknown>);
    if (!isActiveChatListStatus(st)) {
      return NextResponse.json({ error: 'Connection is not active' }, { status: 403 });
    }

    for (const peerId of participantIds) {
      if (peerId === user.id) continue;
      const blocked = await isPairBlocked(admin, user.id, peerId);
      if (blocked) {
        return NextResponse.json({ error: 'Connection blocked' }, { status: 403 });
      }
    }
  }

  try {
    const token = new AccessToken(apiKey, apiSecret, {
      identity: user.id,
      name: participantName,
      ttl: '15m',
    });

    token.addGrant({
      room: roomName,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
    });

    const payload: LiveKitTokenSuccessResponse = {
      token: await token.toJwt(),
      ws_url: wsUrl,
    };
    return NextResponse.json(payload);
  } catch (error) {
    console.error('Failed to generate LiveKit token', error);
    return NextResponse.json({ error: 'Failed to generate LiveKit token' }, { status: 500 });
  }
}
