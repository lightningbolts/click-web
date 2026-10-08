import { NextRequest, NextResponse } from 'next/server';
import { requireEventManager } from '@/lib/events/requireEventManager';
import { requireTicketingEnabled } from '@/lib/server/ticketing/flags';
import { readyPayoutAccount } from '@/lib/server/ticketing/payouts';
import { revalidatePublicEvents } from '@/lib/server/events/revalidatePublicEvents';
import { parseBody } from '@/lib/api/parseBody';
import { apiError } from '@/lib/api/errors';
import { ticketingStatusBodySchema } from '@/lib/api/schemas/ticketing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Organizer sales-lifecycle transitions. Opening sales needs an active tier, and a payout-ready
 * account owned by this organizer only when a tier costs money; `disabled` turns the event back
 * into an RSVP event, allowed only before any ticket exists.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ beaconId: string }> },
) {
  const gate = requireTicketingEnabled();
  if (gate) return gate;

  const { beaconId } = await params;
  const manager = await requireEventManager(request, beaconId);
  if (!manager.ok) return manager.response;

  const parsed = await parseBody(request, ticketingStatusBodySchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
  const admin = manager.admin;

  const { data: event, error: eventError } = await admin
    .from('map_beacons')
    .select('event_cancelled_at')
    .eq('id', beaconId)
    .maybeSingle();
  if (eventError || !event) return apiError('Event not found', 404);
  if ((event as { event_cancelled_at: string | null }).event_cancelled_at) {
    return apiError('This event was cancelled', 409, 'event_cancelled');
  }

  const patch: Record<string, unknown> = { ticketing_status: body.ticketing_status };
  if (body.ticket_sales_start_at !== undefined) patch.ticket_sales_start_at = body.ticket_sales_start_at;
  if (body.ticket_sales_end_at !== undefined) patch.ticket_sales_end_at = body.ticket_sales_end_at;

  if (body.ticketing_status === 'disabled') {
    const { count, error } = await admin
      .from('tickets')
      .select('id', { count: 'exact', head: true })
      .eq('beacon_id', beaconId);
    if (error) return apiError('Failed to update ticketing status', 500);
    if (count) {
      return apiError("Tickets have been issued, so ticketing can't be turned off", 409, 'tickets_issued');
    }
    patch.admission_type = 'rsvp';
  }

  if (body.ticketing_status === 'sales_open') {
    const { data: tiers, error: tierError } = await admin
      .from('ticket_tiers')
      .select('unit_amount')
      .eq('beacon_id', beaconId)
      .eq('is_active', true)
      .is('archived_at', null);
    if (tierError) return apiError('Failed to update ticketing status', 500);
    if (!tiers?.length) {
      return apiError('Add a ticket before opening sales', 409, 'no_active_tiers');
    }

    if ((tiers as { unit_amount: number }[]).some((tier) => tier.unit_amount > 0)) {
      const accountId = await readyPayoutAccount(admin, manager.beacon.creator_id);
      if (!accountId) return apiError('Set up payouts to sell paid tickets', 409, 'organizer_not_ready');
      patch.organizer_payment_account_id = accountId;
    }
    patch.admission_type = 'ticketed';
  }

  const { error } = await admin.from('map_beacons').update(patch).eq('id', beaconId);
  if (error) {
    console.error('ticketing_status update failed:', error.message);
    return apiError('Failed to update ticketing status', 500);
  }

  revalidatePublicEvents(beaconId);
  return NextResponse.json({ ticketing_status: body.ticketing_status });
}
