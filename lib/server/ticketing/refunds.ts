import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { getStripe } from '@/lib/server/stripe';
import type { OrderRow } from '@/lib/server/ticketing/fulfillment';

export type RefundRequestResult =
  | { ok: true; refundId: string; stripeRefundId: string; amount: number }
  | { ok: false; status: number; code: string };

type TicketRow = { id: string; status: string; ticket_tier_id: string };
type ItemRow = { ticket_tier_id: string; unit_amount: number };

/**
 * Organizer-initiated refund of specific tickets (or the whole order when no
 * ids are given). Creates the Stripe refund with reverse_transfer +
 * refund_application_fee so the attendee is made whole and the organizer does
 * not keep proceeds from a voided ticket; the local ticket_refunds row is
 * recorded pending immediately and webhooks reconcile the final state.
 */
export async function requestTicketRefund(
  admin: SupabaseClient,
  order: OrderRow,
  requestedByUserId: string,
  ticketIds: readonly string[] | null,
  reason: string | null,
): Promise<RefundRequestResult> {
  if (order.order_state !== 'paid' && order.order_state !== 'partially_refunded') {
    return { ok: false, status: 409, code: 'order_not_refundable' };
  }
  if (!order.stripe_payment_intent_id) {
    return { ok: false, status: 409, code: 'order_missing_payment_intent' };
  }

  const { data: ticketRows, error: ticketsError } = await admin
    .from('tickets')
    .select('id, status, ticket_tier_id')
    .eq('order_id', order.id);
  if (ticketsError) throw new Error(`tickets load failed: ${ticketsError.message}`);
  const tickets = (ticketRows as TicketRow[]) ?? [];

  const refundable = tickets.filter((t) => t.status === 'valid' || t.status === 'checked_in');
  const targets =
    ticketIds && ticketIds.length > 0
      ? refundable.filter((t) => ticketIds.includes(t.id))
      : refundable;
  if (targets.length === 0) {
    return { ok: false, status: 409, code: 'no_refundable_tickets' };
  }
  if (ticketIds && ticketIds.length > 0 && targets.length !== ticketIds.length) {
    return { ok: false, status: 409, code: 'ticket_not_refundable' };
  }

  const { data: itemRows, error: itemsError } = await admin
    .from('ticket_order_items')
    .select('ticket_tier_id, unit_amount')
    .eq('order_id', order.id);
  if (itemsError) throw new Error(`ticket_order_items load failed: ${itemsError.message}`);
  const unitByTier = new Map(
    ((itemRows as ItemRow[]) ?? []).map((i) => [i.ticket_tier_id, i.unit_amount]),
  );

  let amount = 0;
  for (const t of targets) {
    const unit = unitByTier.get(t.ticket_tier_id);
    if (unit === undefined) return { ok: false, status: 500, code: 'order_item_missing' };
    amount += unit;
  }
  if (amount <= 0) return { ok: false, status: 409, code: 'nothing_to_refund' };

  const stripe = getStripe();
  const targetIds = targets.map((t) => t.id);
  const refund = await stripe.refunds.create(
    {
      payment_intent: order.stripe_payment_intent_id,
      amount,
      reverse_transfer: true,
      refund_application_fee: true,
      metadata: {
        click_order_id: order.id,
        click_ticket_ids: targetIds.join(','),
      },
    },
    // Idempotent on the exact ticket set so an API retry cannot double-refund.
    { idempotencyKey: `refund-order:${order.id}:${[...targetIds].sort().join(',')}` },
  );

  const { data: applied, error: applyError } = await admin.rpc('ticketing_apply_refund', {
    p_order: order.id,
    p_stripe_refund: refund.id,
    p_amount: amount,
    p_status: refund.status === 'succeeded' ? 'succeeded' : 'pending',
    p_ticket_ids: targetIds,
  });
  if (applyError) throw new Error(`ticketing_apply_refund failed: ${applyError.message}`);
  const result = applied as { ok: boolean; refund_id?: string; code?: string };
  if (!result.ok || !result.refund_id) {
    return { ok: false, status: 500, code: result.code ?? 'refund_record_failed' };
  }

  // Record who asked and why (the RPC upsert owns state; this is metadata).
  await admin
    .from('ticket_refunds')
    .update({ requested_by_user_id: requestedByUserId, reason })
    .eq('id', result.refund_id);

  return { ok: true, refundId: result.refund_id, stripeRefundId: refund.id, amount };
}
