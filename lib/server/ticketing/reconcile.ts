import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getStripe } from '@/lib/server/stripe';
import { fulfillFromCheckoutSession, loadOrder } from './fulfillment';
export class TicketingAttentionError extends Error {}
export async function reconcileSession(
  admin: SupabaseClient,
  sessionId: string,
): Promise<'processed' | 'ignored'> {
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  const orderId = session.metadata?.click_order_id;
  if (!orderId) return 'ignored';
  const order = await loadOrder(admin, orderId);
  if (!order) throw new TicketingAttentionError('order_not_found');
  if (order.stripe_checkout_session_id && order.stripe_checkout_session_id !== session.id)
    throw new TicketingAttentionError('session_mismatch');
  if (session.payment_status === 'paid') {
    const result = await fulfillFromCheckoutSession(admin, session);
    if (!result.ok) throw new TicketingAttentionError(result.code);
    return 'processed';
  }
  // A completed session with a processing PaymentIntent remains reserved.
  if (session.status !== 'expired') return 'ignored';
  const intentId =
    typeof session.payment_intent === 'string'
      ? session.payment_intent
      : session.payment_intent?.id;
  if (intentId) {
    let intent = await stripe.paymentIntents.retrieve(intentId);
    if (intent.status === 'succeeded' || intent.status === 'processing') return 'ignored';
    if (intent.status !== 'canceled')
      intent = await stripe.paymentIntents.cancel(
        intentId,
        {},
        { idempotencyKey: 'expire-order:' + orderId },
      );
    if (intent.status !== 'canceled') return 'ignored';
  }
  const { data, error } = await admin.rpc('ticketing_cancel_order', {
    p_order: orderId,
    p_target_state: 'expired',
  });
  if (error) throw new Error(error.message);
  if (!data?.ok && data?.code !== 'order_not_cancelable')
    throw new TicketingAttentionError(data?.code);
  return 'processed';
}
