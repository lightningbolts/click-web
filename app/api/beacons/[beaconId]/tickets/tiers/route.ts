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

  const { user, authError } = await getSupabaseFromRouteRequest(request);
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from('ticket_tiers')
    .select('id, name, description, currency, unit_amount, capacity, max_per_order, max_per_user, sales_start_at, sales_end_at, sort_order, is_active')
    .eq('beacon_id', beaconId)
    .eq('is_active', true)
    .order('sort_order', { ascending: true });
  if (error) {
    return NextResponse.json({ error: 'Failed to load tiers' }, { status: 500 });
  }

  return NextResponse.json({ tiers: data ?? [] });
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
