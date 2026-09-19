import { NextRequest, NextResponse } from 'next/server';
import { requireEventManager } from '@/lib/events/requireEventManager';
import { requireTicketingEnabled } from '@/lib/server/ticketing/flags';
import { loadOrganizerAccount } from '@/lib/server/ticketing/connect';
import { parseBody } from '@/lib/api/parseBody';
import { ticketingStatusBodySchema } from '@/lib/api/schemas/ticketing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Organizer sales-lifecycle transitions. Only the backend may move a paid
 * event into a sellable state: sales_open requires at least one active tier
 * and a payout-ready connected account owned by this organizer.
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

  const patch: Record<string, unknown> = {
    ticketing_status: body.ticketing_status,
  };
  if (body.ticket_sales_start_at !== undefined) {
    patch.ticket_sales_start_at = body.ticket_sales_start_at;
  }
  if (body.ticket_sales_end_at !== undefined) {
    patch.ticket_sales_end_at = body.ticket_sales_end_at;
  }

  if (body.ticketing_status === 'sales_open') {
    const account = await loadOrganizerAccount(admin, manager.userId);
    if (!account || account.onboarding_state !== 'ready' || !account.transfers_enabled) {
      return NextResponse.json(
        { error: 'Organizer payout account is not ready', code: 'organizer_not_ready' },
        { status: 409 },
      );
    }

    const { count, error: tierError } = await admin
      .from('ticket_tiers')
      .select('id', { count: 'exact', head: true })
      .eq('beacon_id', beaconId)
      .eq('is_active', true);
    if (tierError || !count) {
      return NextResponse.json(
        { error: 'A paid event needs at least one active ticket tier', code: 'no_active_tiers' },
        { status: 409 },
      );
    }

    patch.admission_type = 'paid';
    patch.organizer_payment_account_id = account.id;
  }

  const { error } = await admin.from('map_beacons').update(patch).eq('id', beaconId);
  if (error) {
    console.error('ticketing_status update failed:', error.message);
    return NextResponse.json({ error: 'Failed to update ticketing status' }, { status: 500 });
  }

  return NextResponse.json({ ticketing_status: body.ticketing_status });
}
