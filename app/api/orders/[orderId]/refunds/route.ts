import { NextRequest, NextResponse } from 'next/server';
import { requireEventManager } from '@/lib/events/requireEventManager';
import { createAdminSupabaseClient } from '@/lib/server/admin/supabaseAdmin';
import { requireTicketingEnabled } from '@/lib/server/ticketing/flags';
import { loadOrder } from '@/lib/server/ticketing/fulfillment';
import { requestTicketRefund } from '@/lib/server/ticketing/refunds';
import { parseBody } from '@/lib/api/parseBody';
import { refundBodySchema } from '@/lib/api/schemas/ticketing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-fA-F-]{36}$/;

/**
 * Organizer-initiated refund of an order's tickets (all, or the ids given).
 * The Stripe refund is created with reverse_transfer + refund_application_fee;
 * ticket voiding and order state are reconciled by ticketing_apply_refund and
 * finalized by the refund webhook. Never delete tickets or flip order state
 * by hand.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> },
) {
  const gate = requireTicketingEnabled();
  if (gate) return gate;

  const { orderId } = await params;
  if (!UUID_RE.test(orderId)) {
    return NextResponse.json({ error: 'Invalid order id' }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();
  const order = await loadOrder(admin, orderId);
  if (!order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }

  // Refunds are an organizer/staff action on the order's event.
  const manager = await requireEventManager(request, order.beacon_id);
  if (!manager.ok) return manager.response;

  const parsed = await parseBody(request, refundBodySchema);
  if (!parsed.ok) return parsed.response;

  try {
    const result = await requestTicketRefund(
      admin,
      order,
      manager.userId,
      parsed.data.ticket_ids ?? null,
      parsed.data.reason ?? null,
    );
    if (!result.ok) {
      return NextResponse.json(
        { error: 'Refund unavailable', code: result.code },
        { status: result.status },
      );
    }
    return NextResponse.json(
      { refund_id: result.refundId, amount: result.amount },
      { status: 201 },
    );
  } catch (e) {
    console.error('Ticket refund failed:', e);
    return NextResponse.json({ error: 'Refund failed' }, { status: 502 });
  }
}
