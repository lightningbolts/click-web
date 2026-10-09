import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseFromRouteRequest } from '@/lib/server/supabaseRouteAuth';
import { createAdminSupabaseClient } from '@/lib/server/admin/supabaseAdmin';
import { requireTicketWallet } from '@/lib/server/ticketing/flags';
import { listTicketGroups } from '@/lib/server/ticketing/ownedTickets';
import { apiError } from '@/lib/api/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** The signed-in user's ticket wallet, grouped by event. `?scope=past` for events that ended. */
export async function GET(request: NextRequest) {
  const { user, authError } = await getSupabaseFromRouteRequest(request);
  if (authError || !user) return apiError('Unauthorized', 401);

  const scope = request.nextUrl.searchParams.get('scope') === 'past' ? 'past' : 'upcoming';
  try {
    const admin = createAdminSupabaseClient();
    const gate = await requireTicketWallet(admin, user.id);
    if (gate) return gate;
    const groups = await listTicketGroups(admin, user.id, scope, Date.now());
    return NextResponse.json({ groups });
  } catch (e) {
    console.error('Ticket wallet load failed:', e);
    return apiError('Failed to load tickets', 500);
  }
}
