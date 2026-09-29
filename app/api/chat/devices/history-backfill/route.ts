import { NextRequest, NextResponse } from 'next/server';
import { apiError } from '@/lib/api/errors';
import { createChatGatekeeperAdmin, requireBearerUser } from '@/lib/server/chatGatekeeper';
import { groupBackfillRows, type BackfillRow } from '@/lib/server/deviceHistory';

// For an older device: which historical epoch keys to wrap for the user's newer devices whose
// history sharing was approved by email. The device then uploads them via /api/chat/key-transfer.

const DEVICE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export async function GET(request: NextRequest) {
  const auth = await requireBearerUser(request);
  if (!auth.ok) return auth.response;

  const deviceId = (
    request.nextUrl.searchParams.get('device_id') ?? request.nextUrl.searchParams.get('deviceId') ?? ''
  ).trim();
  if (!DEVICE_ID_PATTERN.test(deviceId)) {
    return NextResponse.json({ error: 'device_id is required' }, { status: 400 });
  }

  try {
    const admin = createChatGatekeeperAdmin();
    const { data, error } = await admin.rpc('get_device_history_backfill', {
      p_user_id: auth.user.id,
      p_approving_device_id: deviceId,
    });
    if (error) {
      console.error('[chat/devices/history-backfill] RPC failed', { code: error.code, message: error.message });
      return apiError('Could not load history backfill', 500, 'HISTORY_BACKFILL_FAILED');
    }
    return NextResponse.json({ items: groupBackfillRows((data ?? []) as BackfillRow[]) });
  } catch (error) {
    console.error('[chat/devices/history-backfill] exception', error instanceof Error ? error.message : 'unknown');
    return apiError('Could not load history backfill', 500, 'HISTORY_BACKFILL_FAILED');
  }
}
