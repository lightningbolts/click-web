/**
 * Hangout detection (opt-in in the app's privacy settings).
 *
 * POST   /api/me/presence { lat, lon } → records your latest position (kept ≤ 2 hours, never
 *        shown to anyone) and asks you and any Click within 200 m who also opted in whether
 *        you're hanging out.
 * DELETE /api/me/presence               → forget it now (turning the setting off).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseFromRouteRequest } from '@/lib/server/supabaseRouteAuth';
import { parseBody } from '@/lib/api/parseBody';
import { presencePingBodySchema } from '@/lib/api/schemas/connections';
import { createAdminClient } from '@/lib/server/connectionWriteAuth';
import { handlePresencePing, isValidCoordinate } from '@/lib/hangouts/hangouts';
import { userPushContext } from '@/lib/nudges/moments';

export async function POST(request: NextRequest) {
  const { user, authError } = await getSupabaseFromRouteRequest(request);
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const parsed = await parseBody(request, presencePingBodySchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data as Record<string, unknown>;
  if (!isValidCoordinate(body.lat, body.lon)) {
    return NextResponse.json({ error: 'lat and lon are required' }, { status: 400 });
  }
  const result = await handlePresencePing(createAdminClient(), user.id, body.lat as number, body.lon as number, userPushContext());
  return NextResponse.json(result);
}

export async function DELETE(request: NextRequest) {
  const { user, authError } = await getSupabaseFromRouteRequest(request);
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await createAdminClient().from('presence_pings').delete().eq('user_id', user.id);
  return new NextResponse(null, { status: 204 });
}
