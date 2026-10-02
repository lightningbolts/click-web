import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseFromRouteRequest } from '@/lib/server/supabaseRouteAuth';
import { createAdminSupabaseClient } from '@/lib/server/admin/supabaseAdmin';
import { requireTicketingEnabled } from '@/lib/server/ticketing/flags';

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
    .select(
      'id, beacon_id, buyer_user_id, currency, subtotal_amount, platform_fee_amount, total_amount, order_state, fulfillment_state, checkout_expires_at, paid_at, created_at',
    )
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

  const { buyer_user_id: _omit, ...projection } = order as Record<string, unknown>;
  return NextResponse.json(
    { order: projection },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}
