import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';
import { getStripe } from '@/lib/server/stripe';
import { reconcileSession, TicketingAttentionError } from './reconcile';
import { applyRefundObject } from './webhookHandlers';

/** Recover the external object when Stripe succeeded but its HTTP response was lost. */
export async function recoverReservation(
  admin: SupabaseClient,
  order: {
    id: string;
    stripe_checkout_session_id: string | null;
    created_at: string;
    checkout_expires_at: string;
    checkout_request: Stripe.Checkout.SessionCreateParams | null;
  },
) {
  if (order.stripe_checkout_session_id)
    return reconcileSession(admin, order.stripe_checkout_session_id);
  const stripe = getStripe();
  let cursor: string | undefined;
  const matches: Stripe.Checkout.Session[] = [];
  let complete = false;
  // A frozen absolute expiry bounds the window in which a session could have been created.
  for (let page = 0; page < 10; page++) {
    const sessions = await stripe.checkout.sessions.list({
      created: {
        gte: Math.floor(Date.parse(order.created_at) / 1000) - 60,
        lte: Math.ceil(Date.parse(order.checkout_expires_at) / 1000) + 60,
      },
      limit: 100,
      starting_after: cursor,
    });
    matches.push(...sessions.data.filter((s) => s.metadata?.click_order_id === order.id));
    if (!sessions.has_more) {
      complete = true;
      break;
    }
    cursor = sessions.data.at(-1)?.id;
  }
  if (!complete || matches.length > 1)
    throw new TicketingAttentionError('checkout_recovery_needs_review');
  if (matches[0]) {
    const { error } = await admin
      .from('ticket_orders')
      .update({ stripe_checkout_session_id: matches[0].id })
      .eq('id', order.id)
      .is('stripe_checkout_session_id', null);
    if (error) throw new Error(error.message);
    return reconcileSession(admin, matches[0].id);
  }
  // No matching session exists, and the immutable request's expiry is in the past:
  // any in-flight/retried session creation must now fail Stripe's expiry validation.
  if (
    !order.checkout_request?.expires_at ||
    order.checkout_request.expires_at * 1000 > Date.now() - 120000
  )
    throw new TicketingAttentionError('checkout_recovery_needs_review');
  const { data, error } = await admin.rpc('ticketing_cancel_order', {
    p_order: order.id,
    p_target_state: 'expired',
  });
  if (error) throw new Error(error.message);
  if (!data?.ok) throw new TicketingAttentionError(data?.code);
  return 'processed';
}

export async function recoverRefund(
  admin: SupabaseClient,
  claim: {
    id: string;
    order_id: string;
    stripe_refund_id: string | null;
  },
) {
  const stripe = getStripe();
  if (claim.stripe_refund_id)
    return applyRefundObject(admin, await stripe.refunds.retrieve(claim.stripe_refund_id));
  const { data: order, error } = await admin
    .from('ticket_orders')
    .select('stripe_payment_intent_id')
    .eq('id', claim.order_id)
    .single();
  if (error) throw new Error(error.message);
  if (!order?.stripe_payment_intent_id) throw new TicketingAttentionError('refund_missing_payment');
  let cursor: string | undefined;
  for (let page = 0; page < 10; page++) {
    const refunds = await stripe.refunds.list({
      payment_intent: order.stripe_payment_intent_id,
      limit: 100,
      starting_after: cursor,
    });
    const match = refunds.data.find((r) => r.metadata?.click_refund_request_id === claim.id);
    if (match) return applyRefundObject(admin, match);
    if (!refunds.has_more) break;
    cursor = refunds.data.at(-1)?.id;
  }
  // An uncertain refund remains claimed; do not allow another request to refund those tickets.
  throw new TicketingAttentionError('refund_recovery_needs_review');
}
