/** POST /api/hangouts/{id}/confirm — confirm you were together; the last confirm logs it. */
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseFromRouteRequest } from '@/lib/server/supabaseRouteAuth';
import { createAdminClient } from '@/lib/server/connectionWriteAuth';
import { confirmHangout, serializeHangout } from '@/lib/hangouts/hangouts';

export async function POST(request: NextRequest, context: { params: Promise<{ hangoutId: string }> }) {
  const { user, authError } = await getSupabaseFromRouteRequest(request);
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { hangoutId } = await context.params;
  const result = await confirmHangout(createAdminClient(), hangoutId, user.id);
  if (result.status === 'unavailable') {
    const status = result.reason === 'not_found' ? 404 : result.reason === 'record_failed' ? 500 : 409;
    return NextResponse.json({ error: `Hangout ${result.reason.replace('_', ' ')}`, code: result.reason }, { status });
  }
  return NextResponse.json({
    status: result.status,
    already_logged: result.status === 'confirmed' ? result.alreadyLogged : false,
    hangout: serializeHangout(result.hangout, user.id),
  });
}
