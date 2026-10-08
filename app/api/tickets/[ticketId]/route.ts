import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseFromRouteRequest } from '@/lib/server/supabaseRouteAuth';
import { createAdminSupabaseClient } from '@/lib/server/admin/supabaseAdmin';
import { requireTicketingEnabled } from '@/lib/server/ticketing/flags';
import { loadOwnedTicket } from '@/lib/server/ticketing/ownedTickets';
import { EVENT_BEACON_UUID_RE } from '@/lib/events/eventMetadata';
import { apiError } from '@/lib/api/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** One of the signed-in user's tickets with its event and receipt. Other people's tickets 404. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ ticketId: string }> },
) {
  const gate = requireTicketingEnabled();
  if (gate) return gate;

  const { ticketId } = await params;
  if (!EVENT_BEACON_UUID_RE.test(ticketId)) return apiError('Invalid ticket id', 400);

  const { user, authError } = await getSupabaseFromRouteRequest(request);
  if (authError || !user) return apiError('Unauthorized', 401);

  try {
    const detail = await loadOwnedTicket(createAdminSupabaseClient(), user.id, ticketId);
    if (!detail) return apiError('Ticket not found', 404);
    return NextResponse.json(detail);
  } catch (e) {
    console.error('Ticket load failed:', e);
    return apiError('Failed to load ticket', 500);
  }
}
