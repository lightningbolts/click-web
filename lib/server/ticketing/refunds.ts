import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getStripe } from '@/lib/server/stripe';
import type { OrderRow } from './fulfillment';
import { syncRefundedFees } from './refundFees';
export type RefundRequestResult =
  | { ok: true; refundId: string; stripeRefundId: string; amount: number }
  | { ok: false; status: number; code: string };
export async function requestTicketRefund(
  admin: SupabaseClient,
  order: OrderRow,
  actor: string,
  ticketIds: readonly string[] | null,
  reason: string | null,
  requestId: string,
): Promise<RefundRequestResult> {
  const { data, error } = await admin.rpc('ticketing_claim_refund', {
    p_request: requestId,
    p_order: order.id,
    p_actor: actor,
    p_tickets: ticketIds,
    p_reason: reason,
  });
  if (error) throw new Error(error.message);
  if (!data?.ok) return { ok: false, status: 409, code: data?.code ?? 'refund_claim_failed' };
  const claim = data.refund as {
    id: string;
    amount: number;
    ticket_ids: string[];
    stripe_refund_id: string | null;
    created_at: string;
  };
  if (!order.stripe_payment_intent_id)
    return { ok: false, status: 409, code: 'order_missing_payment_intent' };
  if (!claim.stripe_refund_id && Date.now() - Date.parse(claim.created_at) > 23 * 60 * 60 * 1000)
    return { ok: false, status: 409, code: 'refund_needs_attention' };
  const stripe = getStripe();
  const refund = claim.stripe_refund_id
    ? await stripe.refunds.retrieve(claim.stripe_refund_id)
    : await stripe.refunds.create(
        {
          payment_intent: order.stripe_payment_intent_id,
          amount: claim.amount,
          reverse_transfer: true,
          refund_application_fee: true,
          metadata: { click_order_id: order.id, click_refund_request_id: claim.id },
        },
        { idempotencyKey: 'ticket-refund:' + claim.id },
      );
  const { data: applied, error: applyError } = await admin.rpc('ticketing_apply_refund', {
    p_order: order.id,
    p_request: claim.id,
    p_stripe_refund: refund.id,
    p_amount: refund.amount,
    p_status:
      refund.status === 'succeeded'
        ? 'succeeded'
        : refund.status === 'failed'
          ? 'failed'
          : refund.status === 'canceled'
            ? 'canceled'
            : 'pending',
    p_ticket_ids: claim.ticket_ids,
  });
  if (applyError) throw new Error(applyError.message);
  if (!applied?.ok)
    return { ok: false, status: 500, code: applied?.code ?? 'refund_record_failed' };
  if (refund.status === 'succeeded') await syncRefundedFees(admin, order.id);
  return { ok: true, refundId: claim.id, stripeRefundId: refund.id, amount: claim.amount };
}
