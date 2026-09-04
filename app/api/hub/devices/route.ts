import { NextRequest, NextResponse } from 'next/server';
import { assertHubReadable } from '@/lib/server/hubGatekeeper';
import { createChatGatekeeperAdmin, requireBearerUser } from '@/lib/server/chatGatekeeper';

const DEVICE_COLUMNS =
  'id, user_id, device_id, identity_public_key, key_algorithm, crypto_version, created_at, last_seen_at';

export async function GET(request: NextRequest) {
  const auth = await requireBearerUser(request);
  if (!auth.ok) return auth.response;

  const hubId = (
    request.nextUrl.searchParams.get('hub_id') ?? request.nextUrl.searchParams.get('hubId') ?? ''
  ).trim();
  if (!hubId) return NextResponse.json({ error: 'hub_id is required' }, { status: 400 });

  try {
    const admin = createChatGatekeeperAdmin();
    const denied = await assertHubReadable(admin, hubId, auth.user.id);
    if (denied) return denied;

    const { data: participants, error: participantError } = await admin
      .from('hub_participants')
      .select('user_id')
      .eq('hub_id', hubId);
    if (participantError) throw participantError;

    const userIds = [...new Set(
      (participants ?? [])
        .map((row) => row.user_id)
        .filter((id): id is string => typeof id === 'string' && id.trim().length > 0),
    )];
    if (userIds.length === 0) return NextResponse.json({ hub_id: hubId, devices: [] });

    const { data, error } = await admin
      .from('chat_devices')
      .select(DEVICE_COLUMNS)
      .in('user_id', userIds)
      .eq('key_algorithm', 'X25519')
      .eq('crypto_version', 2)
      .is('revoked_at', null)
      .order('last_seen_at', { ascending: false });
    if (error) throw error;

    return NextResponse.json({ hub_id: hubId, devices: data ?? [] });
  } catch (error) {
    console.error('[hub/devices GET] discovery failed:', error instanceof Error ? error.message : 'unknown');
    return NextResponse.json({ error: 'Failed to load hub devices' }, { status: 500 });
  }
}
