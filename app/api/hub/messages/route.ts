/**
 * GET  /api/hub/messages?hubId=<id>&limit=<n>&aroundMessageId=<uuid>
 * Hydrates hub timeline + participant ids for the authenticated member.
 * Bypasses client RLS with a participant check so mobile init cannot hang
 * on an empty PostgREST read while Realtime subscribe is still pending.
 *
 * POST /api/hub/messages
 * Thin-client insert into hub_messages after JWT + geofence checks.
 *
 * Body JSON:
 *   hub_id, body, user_lat, user_long
 *   message_type? (default 'text')
 *   metadata? (object)
 */

import { NextRequest, NextResponse } from 'next/server';
import { assertHubGeofenceFromCoords } from '@/lib/server/hubGatekeeper';
import { createChatGatekeeperAdmin, requireBearerUser } from '@/lib/server/chatGatekeeper';
import { checkHubMessageCooldown } from '@/lib/hub/hubMessageCooldown';
import { parseBody } from '@/lib/api/parseBody';
import { hubMessagesBodySchema } from '@/lib/api/schemas/beacons';
import { notifyHubMessageParticipants } from '@/lib/hub/notifyHubMessage';
import {
  HUB_AROUND_WINDOW,
  HUB_THREAD_LIMIT,
  hubRealtimeChannel,
  mergeHubThreadWindow,
  normalizeHubMessageRow,
  type HubThreadMessage,
} from '@/lib/hub/hubThread';

type HubMessageInsert = {
  hub_id: string;
  user_id: string;
  body: string;
  message_type?: string;
  metadata?: unknown;
};

export async function GET(request: NextRequest) {
  const auth = await requireBearerUser(request);
  if (!auth.ok) return auth.response;

  const hubId = (request.nextUrl.searchParams.get('hubId') ?? '').trim();
  const aroundMessageId = (request.nextUrl.searchParams.get('aroundMessageId') ?? '').trim();
  const limitRaw = parseInt(request.nextUrl.searchParams.get('limit') ?? String(HUB_THREAD_LIMIT), 10);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), HUB_THREAD_LIMIT) : HUB_THREAD_LIMIT;

  if (!hubId) {
    return NextResponse.json({ error: 'hubId is required' }, { status: 400 });
  }

  const admin = createChatGatekeeperAdmin();
  const { data: participant, error: partErr } = await admin
    .from('hub_participants')
    .select('user_id')
    .eq('hub_id', hubId)
    .eq('user_id', auth.user.id)
    .maybeSingle();
  if (partErr) {
    console.error('[hub/messages GET] participant:', partErr.message);
    return NextResponse.json({ error: 'Failed to load hub' }, { status: 500 });
  }
  if (!participant) {
    return NextResponse.json(
      { error: 'NOT_A_PARTICIPANT', messages: [] as HubThreadMessage[], participant_ids: [] as string[] },
      { status: 403 },
    );
  }

  const { data: partRows, error: partsErr } = await admin
    .from('hub_participants')
    .select('user_id')
    .eq('hub_id', hubId);
  if (partsErr) {
    console.error('[hub/messages GET] participants:', partsErr.message);
  }
  const participantIds = [
    ...new Set(
      (partRows ?? [])
        .map((row) => (typeof row.user_id === 'string' ? row.user_id : ''))
        .filter(Boolean),
    ),
  ];

  let messages: HubThreadMessage[] = [];
  if (aroundMessageId) {
    const { data: targetRow, error: targetErr } = await admin
      .from('hub_messages')
      .select('*')
      .eq('hub_id', hubId)
      .eq('id', aroundMessageId)
      .maybeSingle();
    if (targetErr) {
      console.error('[hub/messages GET] around target:', targetErr.message);
      return NextResponse.json({ error: targetErr.message }, { status: 500 });
    }
    const target = normalizeHubMessageRow(targetRow as Record<string, unknown> | null);
    const window = target ? HUB_AROUND_WINDOW : limit;
    const { data: older } = await admin
      .from('hub_messages')
      .select('*')
      .eq('hub_id', hubId)
      .lte('created_at', target?.created_at ?? new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(window);
    const { data: newer } = target
      ? await admin
          .from('hub_messages')
          .select('*')
          .eq('hub_id', hubId)
          .gt('created_at', target.created_at)
          .order('created_at', { ascending: true })
          .limit(window)
      : { data: [] as Record<string, unknown>[] };
    messages = mergeHubThreadWindow({
      olderOrEqual: (older ?? []).map((row) => normalizeHubMessageRow(row as Record<string, unknown>)).filter((row): row is HubThreadMessage => row != null),
      newer: (newer ?? []).map((row) => normalizeHubMessageRow(row as Record<string, unknown>)).filter((row): row is HubThreadMessage => row != null),
      target,
    });
  } else {
    const { data, error } = await admin
      .from('hub_messages')
      .select('*')
      .eq('hub_id', hubId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) {
      console.error('[hub/messages GET] messages:', error.message);
      return NextResponse.json({ error: 'Failed to load hub messages' }, { status: 500 });
    }
    messages = (data ?? [])
      .map((row) => normalizeHubMessageRow(row as Record<string, unknown>))
      .filter((row): row is HubThreadMessage => row != null)
      .reverse();
  }

  return NextResponse.json({
    messages,
    participant_ids: participantIds,
    occupant_count: Math.max(participantIds.length, 1),
    channel: hubRealtimeChannel(hubId),
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireBearerUser(request);
  if (!auth.ok) return auth.response;

  const parsed = await parseBody(request, hubMessagesBodySchema);
  if (!parsed.ok) return parsed.response;
  const payload = parsed.data;

  const hubId = String(payload.hub_id ?? '').trim();
  const bodyText = typeof payload.body === 'string' ? payload.body.trim() : '';
  const userLat = payload.user_lat;
  const userLong = payload.user_long;

  if (!hubId) {
    return NextResponse.json({ error: 'hub_id is required' }, { status: 400 });
  }
  if (!bodyText) {
    return NextResponse.json({ error: 'body is required' }, { status: 400 });
  }
  if (
    typeof userLat !== 'number' ||
    typeof userLong !== 'number' ||
    Number.isNaN(userLat) ||
    Number.isNaN(userLong)
  ) {
    return NextResponse.json({ error: 'user_lat and user_long are required' }, { status: 400 });
  }

  const admin = createChatGatekeeperAdmin();
  const denied = await assertHubGeofenceFromCoords(admin, hubId, userLat, userLong);
  if (denied) return denied;

  // Geofence passed — make sure the sender is registered as a participant so
  // participant-scoped hub_messages RLS lets them read replies and realtime rows.
  const { error: participantErr } = await admin
    .from('hub_participants')
    .upsert({ hub_id: hubId, user_id: auth.user.id }, { onConflict: 'hub_id,user_id', ignoreDuplicates: true });
  if (participantErr) {
    console.error('[hub/messages] participant upsert:', participantErr.message);
  }

  // Per-user send cooldown (spam guard).
  const { data: lastRow } = await admin
    .from('hub_messages')
    .select('created_at')
    .eq('hub_id', hubId)
    .eq('user_id', auth.user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const lastCreatedAt =
    lastRow != null && typeof (lastRow as { created_at?: unknown }).created_at === 'string'
      ? (lastRow as { created_at: string }).created_at
      : null;
  const cooldown = checkHubMessageCooldown(lastCreatedAt);
  if (!cooldown.allowed) {
    return NextResponse.json(
      {
        error: 'HUB_MESSAGE_COOLDOWN',
        retry_after_seconds: cooldown.retryAfterSeconds,
        message: `Please wait ${cooldown.retryAfterSeconds}s before sending again.`,
      },
      {
        status: 429,
        headers: { 'Retry-After': String(cooldown.retryAfterSeconds) },
      },
    );
  }

  const messageType =
    typeof payload.message_type === 'string' && payload.message_type.trim()
      ? payload.message_type.trim()
      : typeof (payload as Record<string, unknown>).messageType === 'string' &&
          String((payload as Record<string, unknown>).messageType).trim()
        ? String((payload as Record<string, unknown>).messageType).trim()
        : 'text';

  const metadata =
    payload.metadata !== undefined && payload.metadata !== null ? payload.metadata : {};

  const row: HubMessageInsert = {
    hub_id: hubId,
    user_id: auth.user.id,
    body: bodyText,
    message_type: messageType,
    metadata,
  };

  const { data: inserted, error } = await admin.from('hub_messages').insert(row).select('*').single();

  if (error) {
    console.error('[hub/messages] insert:', error.message);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const insertedId =
    inserted && typeof inserted === 'object' && 'id' in inserted && typeof inserted.id === 'string'
      ? inserted.id
      : '';
  if (insertedId) {
    void notifyHubMessageParticipants({
      admin,
      hubId,
      messageId: insertedId,
      senderUserId: auth.user.id,
      preview: bodyText,
    });
  }

  return NextResponse.json({ message: inserted }, { status: 201 });
}
