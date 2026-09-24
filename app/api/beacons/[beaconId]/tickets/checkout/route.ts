import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseFromRouteRequest } from '@/lib/server/supabaseRouteAuth';
import { createAdminSupabaseClient } from '@/lib/server/admin/supabaseAdmin';
import { requireTicketingEnabled } from '@/lib/server/ticketing/flags';
import { createTicketCheckout } from '@/lib/server/ticketing/checkout';
import { parseBody } from '@/lib/api/parseBody';
import { checkoutBodySchema } from '@/lib/api/schemas/ticketing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-fA-F-]{36}$/;

/**
 * Start a ticket purchase: reserve inventory transactionally in Postgres,
 * then create a Stripe-hosted Checkout Session (destination charge to the
 * organizer's connected account with Click's application fee). The client
 * submits only tier ids and quantities — never prices, fees, or accounts —
 * and receives a hosted URL to open in the system browser. Payment truth
 * arrives later via webhook; the return redirect is only navigation.
 */
export async function POST(
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

  const parsed = await parseBody(request, checkoutBodySchema);
  if (!parsed.ok) return parsed.response;

  // Duplicate tier entries would double-count against per-order limits.
  const tierIds = parsed.data.items.map((i) => i.ticket_tier_id);
  if (new Set(tierIds).size !== tierIds.length) {
    return NextResponse.json(
      { error: 'Duplicate ticket tier in items', code: 'duplicate_tier' },
      { status: 400 },
    );
  }

  try {
    const admin = createAdminSupabaseClient();
    const result = await createTicketCheckout(
      admin,
      user.id,
      beaconId,
      parsed.data.items.map((i) => ({ tierId: i.ticket_tier_id, quantity: i.quantity })),
      parsed.data.attempt_id,
    );
    if (!result.ok) {
      return NextResponse.json(
        { error: 'Checkout unavailable', code: result.code, ...(result.extra ?? {}) },
        { status: result.status },
      );
    }
    return NextResponse.json({ order_id: result.orderId, checkout_url: result.checkoutUrl });
  } catch (e) {
    console.error('Ticket checkout failed:', e);
    return NextResponse.json({ error: 'Checkout failed' }, { status: 502 });
  }
}
