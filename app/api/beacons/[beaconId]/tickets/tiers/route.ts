import { mayViewTicketing } from '@/lib/server/ticketing/access';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseFromRouteRequest } from '@/lib/server/supabaseRouteAuth';
import { createAdminSupabaseClient } from '@/lib/server/admin/supabaseAdmin';
import { requireEventManager } from '@/lib/events/requireEventManager';
import { requireTicketingEnabled } from '@/lib/server/ticketing/flags';
import { parseBody } from '@/lib/api/parseBody';
import { createTierBodySchema } from '@/lib/api/schemas/ticketing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-fA-F-]{36}$/;

/** Ticket tiers for an event; attendees see active tiers plus remaining counts. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ beaconId: string }> },
) {
  const gate = requireTicketingEnabled();
  if (gate) return gate;

  const { beaconId } = await params;
  if (!UUID_RE.test(beaconId)) {
    return NextResponse.json({ error: 'Invalid beacon id' }, { status: 400 });
  }

  const { user } = await getSupabaseFromRouteRequest(request);
  const admin = createAdminSupabaseClient();
  const organizer = request.nextUrl.searchParams.get('view') === 'organizer';
  let canRefund = false;
  if (organizer) {
    const manager = await requireEventManager(request, beaconId);
    if (!manager.ok) return manager.response;
    const { data: b } = await admin
      .from('map_beacons')
      .select('financial_principal_id,creator_id')
      .eq('id', beaconId)
      .single();
    canRefund = (b?.financial_principal_id ?? b?.creator_id) === manager.userId;
  } else if (!(await mayViewTicketing(admin, beaconId, user?.id)))
    return NextResponse.json(
      { error: 'Event unavailable', code: 'invitation_required' },
      { status: 403 },
    );
  const [{ data, error }, { data: event }] = await Promise.all([
    admin.rpc('ticketing_tier_inventory', { p_beacons: [beaconId] }),
    admin
      .from('map_beacons')
      .select('admission_type,ticketing_status,ticket_sales_start_at,ticket_sales_end_at')
      .eq('id', beaconId)
      .single(),
  ]);
  if (error) return NextResponse.json({ error: 'Failed to load tiers' }, { status: 500 });
  const tiers = (data ?? [])
    .filter((t: { is_active: boolean }) => organizer || t.is_active)
    .map((t: Record<string, unknown>) => {
      if (organizer) return t;
      const {
        capacity: _capacity,
        sold: _sold,
        held: _held,
        beacon_id: _beacon,
        ...projection
      } = t;
      return projection;
    });
  return NextResponse.json(
    { tiers, event, can_refund: canRefund },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}

/** Organizer creates a tier. The event stays free until publication flips admission. */
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
  if (body.sales_start_at && body.sales_end_at && body.sales_start_at >= body.sales_end_at)
    return NextResponse.json(
      { error: 'Invalid sales window', code: 'invalid_sales_window' },
      { status: 400 },
    );

  const { data, error } = await manager.admin
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
    return NextResponse.json({ error: 'Failed to create tier' }, { status: 500 });
  }

  return NextResponse.json({ tier_id: (data as { id: string }).id }, { status: 201 });
}
