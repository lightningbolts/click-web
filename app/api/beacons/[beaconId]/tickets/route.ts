import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseFromRouteRequest } from '@/lib/server/supabaseRouteAuth';
import { createAdminSupabaseClient } from '@/lib/server/admin/supabaseAdmin';
import { requireTicketWallet } from '@/lib/server/ticketing/flags';
import { listOwnedTickets } from '@/lib/server/ticketing/ownedTickets';
import { EVENT_BEACON_UUID_RE } from '@/lib/events/eventMetadata';
import { apiError } from '@/lib/api/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The signed-in user's tickets for an event. Each live ticket carries its QR credential,
 * derived from the ticket id, so every device shows the same code.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ beaconId: string }> },
) {
  const { beaconId } = await params;
  if (!EVENT_BEACON_UUID_RE.test(beaconId)) return apiError('Invalid beacon id', 400);

  const { user, authError } = await getSupabaseFromRouteRequest(request);
  if (authError || !user) return apiError('Unauthorized', 401);

  try {
    const admin = createAdminSupabaseClient();
    const gate = await requireTicketWallet(admin, user.id);
    if (gate) return gate;
    const tickets = await listOwnedTickets(admin, user.id, { beaconId });
    return NextResponse.json({ tickets });
  } catch (e) {
    console.error('Event tickets load failed:', e);
    return apiError('Failed to load tickets', 500);
  }
}
