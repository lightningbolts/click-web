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
import { assertHubGeofenceFromCoords, assertHubReadable } from '@/lib/server/hubGatekeeper';
import { createChatGatekeeperAdmin, requireBearerUser } from '@/lib/server/chatGatekeeper';
import { parseBody } from '@/lib/api/parseBody';
import { hubMessagesBodySchema } from '@/lib/api/schemas/beacons';
import {
  HUB_MESSAGE_RATE_LIMIT,
  HUB_MESSAGE_RATE_LIMIT_BINDING,
  HUB_MUTATION_RATE_WINDOW_MS,
  isRateLimited,
} from '@/lib/server/rateLimit';
import { notifyHubMessageParticipants } from '@/lib/hub/notifyHubMessage';
import {
  assertHubE2eeV2MediaMessageWrite,
  assertHubE2eeV2MessageWrite,
} from '@/lib/server/hubE2eeV2Gate';
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readMessageMetadata(
  body: Record<string, unknown>,
  metadata: Record<string, unknown>,
  snake: string,
  camel: string,
): unknown {
  const direct = body[snake] ?? body[camel];
  if (direct !== undefined) return direct;
  return metadata[snake] ?? metadata[camel];
}

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
  // A participant row is not sufficient for event hubs: a checked-out or
  // expired attendee can otherwise keep reading through a stale row.
  const denied = await assertHubReadable(admin, hubId, auth.user.id);
  if (denied) return denied;

  const { data: partRows, error: partsErr } = await admin
    .from('hub_participants')
    .select('user_id')
    .eq('hub_id', hubId);
  if (partsErr) {
    console.error('[hub/messages GET] participants:', partsErr.message);
  }
  const allParticipantIds = [
    ...new Set(
      (partRows ?? [])
        .map((row) => (typeof row.user_id === 'string' ? row.user_id : ''))
        .filter(Boolean),
    ),
  ];

  // Event hosts may opt out of publishing a guest list. Participants can still
  // read the room, but only receive its occupant count, not a directory of ids.
  let participantIds = allParticipantIds;
  const { data: hubVenue, error: venueErr } = await admin
    .from('hub_venues')
    .select('event_beacon_id')
    .eq('id', hubId)
    .maybeSingle();
  if (venueErr) {
    console.error('[hub/messages GET] event venue:', venueErr.message);
    return NextResponse.json({ error: 'Failed to load hub' }, { status: 500 });
  }
  const eventBeaconId =
    hubVenue != null && typeof (hubVenue as { event_beacon_id?: unknown }).event_beacon_id === 'string'
      ? (hubVenue as { event_beacon_id: string }).event_beacon_id
      : null;
  if (eventBeaconId) {
    const { data: eventBeacon, error: eventErr } = await admin
      .from('map_beacons')
      .select('creator_id, guest_list_visibility')
      .eq('id', eventBeaconId)
      .maybeSingle();
    if (eventErr) {
      console.error('[hub/messages GET] event guest visibility:', eventErr.message);
      return NextResponse.json({ error: 'Failed to load hub' }, { status: 500 });
    }
    const hostId =
      eventBeacon != null && typeof (eventBeacon as { creator_id?: unknown }).creator_id === 'string'
        ? (eventBeacon as { creator_id: string }).creator_id
        : null;
    const hostsOnly =
      eventBeacon != null &&
      (eventBeacon as { guest_list_visibility?: unknown }).guest_list_visibility === 'hosts_only';
    if (hostsOnly && hostId !== auth.user.id) participantIds = [];
  }

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
      return NextResponse.json({ error: 'Failed to load hub messages' }, { status: 500 });
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
    occupant_count: Math.max(allParticipantIds.length, 1),
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
    await isRateLimited({
      bindingName: HUB_MESSAGE_RATE_LIMIT_BINDING,
      key: `hub-message:${auth.user.id}:${hubId}`,
      limit: HUB_MESSAGE_RATE_LIMIT,
      windowMs: HUB_MUTATION_RATE_WINDOW_MS,
    })
  ) {
    return NextResponse.json(
      { error: 'RATE_LIMITED', message: 'Too many messages. Please wait a moment and try again.' },
      { status: 429 },
    );
  }
  const admin = createChatGatekeeperAdmin();
  const denied = await assertHubGeofenceFromCoords(
    admin,
    hubId,
    typeof userLat === 'number' ? userLat : Number.NaN,
    typeof userLong === 'number' ? userLong : Number.NaN,
    auth.user.id,
  );
  if (denied) return denied;

  // Geofence passed — make sure the sender is registered as a participant so
  // participant-scoped hub_messages RLS lets them read replies and realtime rows.
  const { error: participantErr } = await admin
    .from('hub_participants')
    .upsert({ hub_id: hubId, user_id: auth.user.id }, { onConflict: 'hub_id,user_id', ignoreDuplicates: true });
  if (participantErr) {
    console.error('[hub/messages] participant upsert:', participantErr.message);
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

  const metadataRecord = isRecord(metadata) ? metadata : {};
  const e2eeGate = await assertHubE2eeV2MessageWrite(admin, {
    hubId,
    userId: auth.user.id,
    content: bodyText,
    epoch: readMessageMetadata(payload as Record<string, unknown>, metadataRecord, 'epoch', 'epoch'),
    senderDeviceId: readMessageMetadata(
      payload as Record<string, unknown>,
      metadataRecord,
      'sender_device_id',
      'senderDeviceId',
    ),
    clientMessageId: readMessageMetadata(
      payload as Record<string, unknown>,
      metadataRecord,
      'client_message_id',
      'clientMessageId',
    ),
  });
  if (!e2eeGate.ok) return e2eeGate.response;

  if (e2eeGate.envelope && ['image', 'audio'].includes(messageType.toLowerCase())) {
    const mediaBinding = assertHubE2eeV2MediaMessageWrite({
      hubId,
      userId: auth.user.id,
      messageEnvelope: e2eeGate.envelope,
      metadata: metadataRecord,
    });
    if (!mediaBinding.ok) return mediaBinding.response;
  }

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
    return NextResponse.json({ error: 'Failed to send hub message' }, { status: 400 });
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
    });
  }

  return NextResponse.json({ message: inserted }, { status: 201 });
}
