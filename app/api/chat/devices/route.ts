import { NextRequest, NextResponse } from 'next/server';
import { type SupabaseClient } from '@supabase/supabase-js';
import {
  assertChatWritable,
  createChatGatekeeperAdmin,
  requireBearerUser,
} from '@/lib/server/chatGatekeeper';

// Rollout-gated E2EE v2 device registry/discovery surface. Message writes and key transfer
// remain out of this route until the v2 rollout gate is enabled.

const DEVICE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const STANDARD_BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const X25519_SPKI_PREFIX = [
  0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x6e, 0x03, 0x21, 0x00,
];
const POST_DEVICE_COLUMNS =
  'id, device_id, identity_public_key, key_algorithm, crypto_version, created_at, last_seen_at';
const GET_DEVICE_COLUMNS =
  'id, user_id, device_id, identity_public_key, key_algorithm, crypto_version, created_at, last_seen_at';

type DeviceRow = {
  id: string;
  user_id?: string;
  device_id: string;
  identity_public_key: string;
  key_algorithm: 'X25519' | string;
  crypto_version: number;
  created_at: string;
  last_seen_at: string;
};

function errorResponse(status = 500) {
  return NextResponse.json({ error: 'Internal server error' }, { status });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseDeviceId(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim() !== value || !DEVICE_ID_PATTERN.test(value)) {
    return null;
  }
  return value;
}

function isX25519SpkiBase64(value: unknown): value is string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > 128 ||
    value.length % 4 !== 0 ||
    !STANDARD_BASE64_PATTERN.test(value)
  ) {
    return false;
  }

  try {
    const decoded = atob(value);
    // Re-encoding rejects non-canonical standard base64 spellings.
    if (btoa(decoded) !== value || decoded.length !== 44) return false;
    const bytes = Array.from(decoded, (character) => character.charCodeAt(0));
    return X25519_SPKI_PREFIX.every((byte, index) => bytes[index] === byte);
  } catch {
    return false;
  }
}

function postProjection(row: DeviceRow) {
  return {
    id: row.id,
    device_id: row.device_id,
    identity_public_key: row.identity_public_key,
    key_algorithm: row.key_algorithm,
    crypto_version: row.crypto_version,
    created_at: row.created_at,
    last_seen_at: row.last_seen_at,
  };
}

function getProjection(row: DeviceRow) {
  return {
    id: row.id,
    user_id: row.user_id,
    device_id: row.device_id,
    identity_public_key: row.identity_public_key,
    key_algorithm: row.key_algorithm,
    crypto_version: row.crypto_version,
    created_at: row.created_at,
    last_seen_at: row.last_seen_at,
  };
}

async function parseJson(request: NextRequest): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await request.json();
    return isRecord(body) ? body : null;
  } catch {
    return null;
  }
}

async function resolveParticipantIds(
  admin: SupabaseClient,
  chatId: string,
): Promise<{ ids: string[] } | { response: NextResponse }> {
  const { data: chat, error: chatError } = await admin
    .from('chats')
    .select('connection_id, group_id')
    .eq('id', chatId)
    .maybeSingle();

  if (chatError) {
    console.error('[chat/devices] chat lookup failed:', chatError.message);
    return { response: errorResponse() };
  }
  if (!chat) return { response: NextResponse.json({ error: 'Chat not found' }, { status: 404 }) };

  if (chat.group_id) {
    const { data: members, error: membersError } = await admin
      .from('group_members')
      .select('user_id')
      .eq('group_id', chat.group_id);
    if (membersError) {
      console.error('[chat/devices] group member lookup failed:', membersError.message);
      return { response: errorResponse() };
    }
    return {
      ids: [...new Set(
        (members ?? [])
          .map((row: { user_id?: unknown }) => row.user_id)
          .filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
          .map((id) => id.trim()),
      )],
    };
  }

  if (chat.connection_id) {
    const { data: connection, error: connectionError } = await admin
      .from('connections')
      .select('user_ids')
      .eq('id', chat.connection_id)
      .maybeSingle();
    if (connectionError) {
      console.error('[chat/devices] connection participant lookup failed:', connectionError.message);
      return { response: errorResponse() };
    }
    return {
      ids: [...new Set(
        (Array.isArray(connection?.user_ids) ? connection.user_ids : [])
          .filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
          .map((id) => id.trim()),
      )],
    };
  }

  return { response: errorResponse() };
}

export async function POST(request: NextRequest) {
  const auth = await requireBearerUser(request);
  if (!auth.ok) return auth.response;

  const body = await parseJson(request);
  const deviceId = parseDeviceId(body?.device_id);
  const publicKey = body?.identity_public_key;
  if (!deviceId || !isX25519SpkiBase64(publicKey)) {
    return NextResponse.json({ error: 'Invalid device registration' }, { status: 400 });
  }

  try {
    const admin = createChatGatekeeperAdmin();
    const lastSeenAt = new Date().toISOString();
    const { data, error } = await admin
      .from('chat_devices')
      .insert({
        user_id: auth.user.id,
        device_id: deviceId,
        identity_public_key: publicKey,
        key_algorithm: 'X25519',
        crypto_version: 2,
        last_seen_at: lastSeenAt,
      })
      .select(POST_DEVICE_COLUMNS)
      .single();

    if (error || !data) {
      if (error?.code === '23505') {
        return NextResponse.json({ error: 'Device already registered' }, { status: 409 });
      }
      if (error) console.error('[chat/devices] registration failed:', error.message);
      return errorResponse();
    }

    return NextResponse.json({ device: postProjection(data as DeviceRow) });
  } catch (error) {
    console.error('[chat/devices] registration exception:', error instanceof Error ? error.message : 'unknown');
    return errorResponse();
  }
}

export async function GET(request: NextRequest) {
  const auth = await requireBearerUser(request);
  if (!auth.ok) return auth.response;

  const chatId = (
    request.nextUrl.searchParams.get('chat_id') ?? request.nextUrl.searchParams.get('chatId') ?? ''
  ).trim();
  if (!chatId) return NextResponse.json({ error: 'chat_id is required' }, { status: 400 });

  try {
    const admin = createChatGatekeeperAdmin();
    const denied = await assertChatWritable(admin, auth.user.id, chatId);
    if (denied) return denied;

    const participants = await resolveParticipantIds(admin, chatId);
    if ('response' in participants) return participants.response;
    if (participants.ids.length === 0) return NextResponse.json({ devices: [] });

    const { data, error } = await admin
      .from('chat_devices')
      .select(GET_DEVICE_COLUMNS)
      .in('user_id', participants.ids)
      .eq('key_algorithm', 'X25519')
      .eq('crypto_version', 2)
      .is('revoked_at', null)
      .order('last_seen_at', { ascending: false });
    if (error) {
      console.error('[chat/devices] device discovery failed:', error.message);
      return errorResponse();
    }

    return NextResponse.json({ devices: (data ?? []).map((row) => getProjection(row as DeviceRow)) });
  } catch (error) {
    console.error('[chat/devices] discovery exception:', error instanceof Error ? error.message : 'unknown');
    return errorResponse();
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireBearerUser(request);
  if (!auth.ok) return auth.response;

  const deviceId = parseDeviceId(
    request.nextUrl.searchParams.get('device_id') ?? request.nextUrl.searchParams.get('deviceId'),
  );
  if (!deviceId) return NextResponse.json({ error: 'device_id is required' }, { status: 400 });

  try {
    const { error } = await createChatGatekeeperAdmin()
      .from('chat_devices')
      .update({ revoked_at: new Date().toISOString() })
      .eq('user_id', auth.user.id)
      .eq('device_id', deviceId)
      .is('revoked_at', null);
    if (error) {
      console.error('[chat/devices] revocation failed:', error.message);
      return errorResponse();
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[chat/devices] revocation exception:', error instanceof Error ? error.message : 'unknown');
    return errorResponse();
  }
}
