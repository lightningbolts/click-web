/**
 * PATCH  /api/hub/messages/[messageId] — edit the caller's text message.
 * DELETE /api/hub/messages/[messageId] — delete the caller's Hub message.
 */

import { NextRequest, NextResponse } from 'next/server';
import { parseBody } from '@/lib/api/parseBody';
import { hubInteractionBodySchema } from '@/lib/api/schemas/beacons';
import { createChatGatekeeperAdmin, requireBearerUser } from '@/lib/server/chatGatekeeper';
import { assertHubE2eeV2MessageWrite } from '@/lib/server/hubE2eeV2Gate';
import { assertHubGeofenceFromCoords } from '@/lib/server/hubGatekeeper';
import { normalizeHubMessageRow } from '@/lib/hub/hubThread';

type RouteContext = { params: Promise<{ messageId: string }> };

type MutableHubMessage = {
  id: string;
  hub_id: string;
  user_id: string;
  message_type: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readMetadata(
  metadata: Record<string, unknown>,
  snake: string,
  camel: string,
): unknown {
  return metadata[snake] ?? metadata[camel];
}

async function loadOwnedTarget(
  admin: ReturnType<typeof createChatGatekeeperAdmin>,
  messageId: string,
  hubId: string,
  userId: string,
): Promise<{ target: MutableHubMessage } | { response: NextResponse }> {
  const { data, error } = await admin
    .from('hub_messages')
    .select('id, hub_id, user_id, message_type')
    .eq('id', messageId)
    .maybeSingle();

  if (error) {
    console.error('[hub/messages mutation] target lookup:', error.message);
    return { response: NextResponse.json({ error: 'Failed to load Hub message' }, { status: 500 }) };
  }
  if (!data || data.hub_id !== hubId) {
    return { response: NextResponse.json({ error: 'Hub message not found' }, { status: 404 }) };
  }
  if (data.user_id !== userId) {
    return { response: NextResponse.json({ error: 'Only the sender can modify this message' }, { status: 403 }) };
  }
  return { target: data as MutableHubMessage };
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireBearerUser(request);
  if (!auth.ok) return auth.response;

  const { messageId: rawMessageId } = await context.params;
  const messageId = rawMessageId?.trim();
  if (!messageId) {
    return NextResponse.json({ error: 'messageId is required' }, { status: 400 });
  }

  const parsed = await parseBody(request, hubInteractionBodySchema);
  if (!parsed.ok) return parsed.response;
  const { hubId, userLat, userLong } = parsed.data;
  const body = parsed.data.body?.trim() ?? '';
  if (!body) {
    return NextResponse.json({ error: 'body is required' }, { status: 400 });
  }

  const admin = createChatGatekeeperAdmin();
  const owned = await loadOwnedTarget(admin, messageId, hubId.trim(), auth.user.id);
  if ('response' in owned) return owned.response;
  if ((owned.target.message_type ?? 'text').toLowerCase() !== 'text') {
    return NextResponse.json({ error: 'Only text Hub messages can be edited' }, { status: 400 });
  }

  const denied = await assertHubGeofenceFromCoords(
    admin,
    owned.target.hub_id,
    userLat,
    userLong,
    auth.user.id,
  );
  if (denied) return denied;

  const metadata = isRecord(parsed.data.metadata) ? parsed.data.metadata : {};
  const e2eeGate = await assertHubE2eeV2MessageWrite(admin, {
    hubId: owned.target.hub_id,
    userId: auth.user.id,
    content: body,
    epoch: readMetadata(metadata, 'epoch', 'epoch'),
    senderDeviceId: readMetadata(metadata, 'sender_device_id', 'senderDeviceId'),
    clientMessageId: readMetadata(metadata, 'client_message_id', 'clientMessageId'),
  });
  if (!e2eeGate.ok) return e2eeGate.response;

  const editedAt = new Date().toISOString();
  const { data: updated, error } = await admin
    .from('hub_messages')
    .update({
      body,
      metadata,
      edited_at: editedAt,
    })
    .eq('id', owned.target.id)
    .eq('hub_id', owned.target.hub_id)
    .eq('user_id', auth.user.id)
    .select('*')
    .single();

  if (error) {
    console.error('[hub/messages PATCH]', error.message);
    return NextResponse.json({ error: 'Failed to edit Hub message' }, { status: 500 });
  }

  const message = normalizeHubMessageRow(updated as Record<string, unknown>);
  return NextResponse.json({ message: message ?? updated });
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const auth = await requireBearerUser(request);
  if (!auth.ok) return auth.response;

  const { messageId: rawMessageId } = await context.params;
  const messageId = rawMessageId?.trim();
  if (!messageId) {
    return NextResponse.json({ error: 'messageId is required' }, { status: 400 });
  }

  const parsed = await parseBody(request, hubInteractionBodySchema);
  if (!parsed.ok) return parsed.response;
  const { hubId, userLat, userLong } = parsed.data;

  const admin = createChatGatekeeperAdmin();
  const owned = await loadOwnedTarget(admin, messageId, hubId.trim(), auth.user.id);
  if ('response' in owned) return owned.response;

  const denied = await assertHubGeofenceFromCoords(
    admin,
    owned.target.hub_id,
    userLat,
    userLong,
    auth.user.id,
  );
  if (denied) return denied;

  const { error } = await admin
    .from('hub_messages')
    .delete()
    .eq('id', owned.target.id)
    .eq('hub_id', owned.target.hub_id)
    .eq('user_id', auth.user.id);

  if (error) {
    console.error('[hub/messages DELETE]', error.message);
    return NextResponse.json({ error: 'Failed to delete Hub message' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
