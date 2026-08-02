/**
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

type HubMessageInsert = {
  hub_id: string;
  user_id: string;
  body: string;
  message_type?: string;
  metadata?: unknown;
};

export async function POST(request: NextRequest) {
  const auth = await requireBearerUser(request);
  if (!auth.ok) return auth.response;

  let payload: {
    hub_id?: string;
    hubId?: string;
    body?: string;
    user_lat?: number;
    user_long?: number;
    message_type?: string;
    messageType?: string;
    metadata?: unknown;
  };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const hubId = String(payload.hub_id ?? payload.hubId ?? '').trim();
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
      : typeof payload.messageType === 'string' && payload.messageType.trim()
        ? payload.messageType.trim()
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

  return NextResponse.json({ message: inserted }, { status: 201 });
}
