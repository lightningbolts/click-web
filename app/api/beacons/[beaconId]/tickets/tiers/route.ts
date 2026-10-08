import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseFromRouteRequest } from '@/lib/server/supabaseRouteAuth';
import { createAdminSupabaseClient } from '@/lib/server/admin/supabaseAdmin';
import { requireEventManager } from '@/lib/events/requireEventManager';
import { EVENT_BEACON_UUID_RE } from '@/lib/events/eventMetadata';
import { requireTicketingEnabled } from '@/lib/server/ticketing/flags';
import { loadEventSales, loadManagedTiers, loadOfferings } from '@/lib/server/ticketing/offerings';
import { revalidatePublicEvents } from '@/lib/server/events/revalidatePublicEvents';
import { parseBody } from '@/lib/api/parseBody';
import { apiError } from '@/lib/api/errors';
import { createTierBodySchema, salesWindowInverted } from '@/lib/api/schemas/ticketing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * An event's ticket tiers. Anyone can see what's on sale (the event page is public);
 * `?manage=1` returns every unarchived tier with sales counts for organizers and Place viewers.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ beaconId: string }> },
) {
  const gate = requireTicketingEnabled();
  if (gate) return gate;

  const { beaconId } = await params;

  if (request.nextUrl.searchParams.get('manage') === '1') {
    const manager = await requireEventManager(request, beaconId, { allowViewers: true });
    if (!manager.ok) return manager.response;
    return NextResponse.json({ tiers: await loadManagedTiers(manager.admin, beaconId, Date.now()) });
  }

  if (!EVENT_BEACON_UUID_RE.test(beaconId)) return apiError('Invalid beacon id', 400);
  // Signed-in buyers get their per-person limits applied; signed-out visitors still see prices.
  const { user } = await getSupabaseFromRouteRequest(request);
  const loaded = await loadOfferings(createAdminSupabaseClient(), beaconId, user?.id ?? null, Date.now());
  if (!loaded) return apiError('Event not found', 404);
  return NextResponse.json({ tiers: loaded.offerings });
}

/** Organizer adds a tier. The first tier makes an RSVP event a ticketed draft. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ beaconId: string }> },
) {
  const gate = requireTicketingEnabled();
  if (gate) return gate;

  const { beaconId } = await params;
  const manager = await requireEventManager(request, beaconId);
  if (!manager.ok) return manager.response;

  const parsed = await parseBody(request, createTierBodySchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
  if (salesWindowInverted(body.sales_start_at, body.sales_end_at)) {
    return apiError('Sales must end after they start', 400, 'invalid_window');
  }

  const admin = manager.admin;
  const event = await loadEventSales(admin, beaconId);
  if (!event) return apiError('Event not found', 404);
  if (event.event_cancelled_at) return apiError('This event was cancelled', 409, 'event_cancelled');

  const { data, error } = await admin
    .from('ticket_tiers')
    .insert({
      beacon_id: beaconId,
      name: body.name,
      description: body.description ?? null,
      currency: 'usd',
      unit_amount: body.unit_amount,
      capacity: body.capacity,
      max_per_order: body.max_per_order,
      max_per_user: body.max_per_user ?? null,
      sales_start_at: body.sales_start_at ?? null,
      sales_end_at: body.sales_end_at ?? null,
      sort_order: body.sort_order,
    })
    .select('id')
    .single();
  if (error) {
    console.error('ticket_tiers insert failed:', error.message);
    return apiError('Failed to create tier', 500);
  }

  if (event.admission_type !== 'ticketed') {
    const { error: eventError } = await admin
      .from('map_beacons')
      .update({ admission_type: 'ticketed', ticketing_status: 'draft' })
      .eq('id', beaconId);
    if (eventError) {
      console.error('ticketed admission update failed:', eventError.message);
      return apiError('Failed to create tier', 500);
    }
  }

  revalidatePublicEvents(beaconId);
  return NextResponse.json({ tier_id: (data as { id: string }).id }, { status: 201 });
}
