import { NextRequest, NextResponse } from 'next/server';
import { createChatGatekeeperAdmin, requireBearerUser } from '@/lib/server/chatGatekeeper';

type Row = { device_id: string; device_label: string | null; created_at: string; last_seen_at: string | null };

/**
 * GET /api/me/devices — the caller's active chat devices, most recently seen first:
 * `{ devices: [{ device_id, label, created_at, last_seen_at }] }` (Settings › Devices, spec §7.8).
 * Remove one with DELETE /api/chat/devices?device_id=.
 */
export async function GET(request: NextRequest) {
  const auth = await requireBearerUser(request);
  if (!auth.ok) return auth.response;
  try {
    const { data, error } = await createChatGatekeeperAdmin()
      .from('chat_devices')
      .select('device_id, device_label, created_at, last_seen_at')
      .eq('user_id', auth.user.id)
      .is('revoked_at', null)
      .order('last_seen_at', { ascending: false, nullsFirst: false });
    if (error) throw new Error(error.message);
    return NextResponse.json(
      {
        devices: ((data ?? []) as Row[]).map((r) => ({
          device_id: r.device_id,
          label: r.device_label,
          created_at: r.created_at,
          last_seen_at: r.last_seen_at,
        })),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    console.error('GET /api/me/devices:', e instanceof Error ? e.message : 'unknown');
    return NextResponse.json({ error: 'Couldn’t load your devices.' }, { status: 500 });
  }
}
