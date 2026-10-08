import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseFromRouteRequest } from '@/lib/server/supabaseRouteAuth';
import { createAdminSupabaseClient } from '@/lib/server/admin/supabaseAdmin';
import { requireTicketingEnabled } from '@/lib/server/ticketing/flags';
import { releaseCheckout } from '@/lib/server/ticketing/checkout';
import { revalidatePublicEvents } from '@/lib/server/events/revalidatePublicEvents';
import { apiError } from '@/lib/api/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-fA-F-]{36}$/;

/**
 * Buyer's view of an order — what the app polls after the Checkout browser
 * return. The redirect is never proof of payment; this local projection
 * (updated by webhooks) is the truth the UI renders:
 *   paid+fulfilled -> show ticket; checkout_created -> waiting; etc.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> },
) {
  const gate = requireTicketingEnabled();
  if (gate) return gate;

  const { orderId } = await params;
  if (!UUID_RE.test(orderId)) {
    return NextResponse.json({ error: 'Invalid order id' }, { status: 400 });
  }

  const { user, authError } = await getSupabaseFromRouteRequest(request);
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from('ticket_orders')
    .select('id, beacon_id, buyer_user_id, currency, subtotal_amount, total_amount, order_state, fulfillment_state, checkout_expires_at, paid_at, created_at')
    .eq('id', orderId)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: 'Failed to load order' }, { status: 500 });
  }
  const order = data as { buyer_user_id: string } | null;
  if (!order || order.buyer_user_id !== user.id) {
    // Same response for missing and foreign orders.
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }

  const { count, error: countError } = await admin
    .from('tickets')
    .select('id', { count: 'exact', head: true })
    .eq('order_id', orderId);
  if (countError) {
    return NextResponse.json({ error: 'Failed to load order' }, { status: 500 });
  }

  // Buyers never see Click's fee: the organizer absorbs it.
  const { buyer_user_id: _omit, ...projection } = order as Record<string, unknown>;
  return NextResponse.json({ order: { ...projection, platform_fee_amount: 0, ticket_count: count ?? 0 } });
}

/**
 * The buyer backed out of Stripe Checkout: release the order's held tickets now (they'd
 * otherwise stay held, even from the buyer, until the session expires).
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> },
) {
  const gate = requireTicketingEnabled();
  if (gate) return gate;

  const { orderId } = await params;
  if (!UUID_RE.test(orderId)) return apiError('Invalid order id', 400);

  const { user, authError } = await getSupabaseFromRouteRequest(request);
  if (authError || !user) return apiError('Unauthorized', 401);

  try {
    const released = await releaseCheckout(createAdminSupabaseClient(), orderId, user.id);
    if (!released.ok) {
      return apiError(released.status === 404 ? 'Order not found' : 'This order can no longer be cancelled', released.status, released.code);
    }
    // Freed tickets may turn "Sold out" back into "Get tickets".
    revalidatePublicEvents(released.beaconId);
    return NextResponse.json({ order_state: 'canceled' });
  } catch (e) {
    console.error('DELETE /api/orders/[orderId]:', e);
    return apiError('Could not cancel the order', 500);
  }
}
