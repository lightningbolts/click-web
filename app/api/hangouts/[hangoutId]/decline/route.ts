/** POST /api/hangouts/{id}/decline — "we weren't together"; nothing is logged. */
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseFromRouteRequest } from '@/lib/server/supabaseRouteAuth';
import { createAdminClient } from '@/lib/server/connectionWriteAuth';
import { declineHangout } from '@/lib/hangouts/hangouts';

export async function POST(request: NextRequest, context: { params: Promise<{ hangoutId: string }> }) {
  const { user, authError } = await getSupabaseFromRouteRequest(request);
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { hangoutId } = await context.params;
  const declined = await declineHangout(createAdminClient(), hangoutId, user.id);
  return declined ? new NextResponse(null, { status: 204 }) : NextResponse.json({ error: 'Hangout not found' }, { status: 404 });
}
