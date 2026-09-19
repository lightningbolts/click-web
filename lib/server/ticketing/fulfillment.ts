import 'server-only';

import type Stripe from 'stripe';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getStripe } from '@/lib/server/stripe';
import { mintTicketCredential, mintTicketNumber } from '@/lib/server/ticketing/credentials';

export type OrderRow = {
  id: string;
  beacon_id: string;
  buyer_user_id: string;
  organizer_payment_account_id: string;
  currency: string;
  subtotal_amount: number;
  platform_fee_amount: number;
  total_amount: number;
  order_state: string;
  fulfillment_state: string;
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
};

export async function loadOrder(admin: SupabaseClient, orderId: string): Promise<OrderRow | null> {
  const { data, error } = await admin
    .from('ticket_orders')
    .select('*')
    .eq('id', orderId)
    .maybeSingle();
  if (error) throw new Error(`ticket_orders load failed: ${error.message}`);
  return (data as OrderRow | null) ?? null;
}

/**
 * Fulfill a Click order from a verified, paid Checkout Session.
 *
 * The session's type looking successful is not enough: this retrieves the
 * PaymentIntent server-side and verifies amount, currency, destination
 * account, and application fee against the immutable order snapshot before
 * the single-transaction fulfillment RPC runs. Safe under duplicate and
 * out-of-order webhook delivery.
 */
export async function fulfillFromCheckoutSession(
  admin: SupabaseClient,
  session: Stripe.Checkout.Session,
): Promise<{ ok: boolean; code?: string }> {
  const orderId = session.metadata?.click_order_id ?? session.client_reference_id;
  if (!orderId) return { ok: false, code: 'missing_order_reference' };

  const order = await loadOrder(admin, orderId);
  if (!order) return { ok: false, code: 'order_not_found' };
  if (order.order_state === 'paid' && order.fulfillment_state === 'fulfilled') {
    return { ok: true, code: 'idempotent' };
  }
  if (
    order.stripe_checkout_session_id &&
    order.stripe_checkout_session_id !== session.id
  ) {
    return { ok: false, code: 'session_mismatch' };
  }
  if (session.payment_status !== 'paid') {
    // Delayed-notification methods are not enabled in v1; leave the order for
    // the async-success event or expiry sweep.
    return { ok: false, code: 'not_paid_yet' };
  }

  const stripe = getStripe();
  const paymentIntentId =
    typeof session.payment_intent === 'string'
      ? session.payment_intent
      : session.payment_intent?.id ?? null;
  if (!paymentIntentId) return { ok: false, code: 'missing_payment_intent' };

  const intent = await stripe.paymentIntents.retrieve(paymentIntentId, {
    expand: ['latest_charge'],
  });

  const verification = verifyIntentAgainstOrder(intent, order);
  if (verification) return { ok: false, code: verification };

  const destination =
    typeof intent.transfer_data?.destination === 'string'
      ? intent.transfer_data.destination
      : intent.transfer_data?.destination?.id ?? null;
  if (!(await destinationMatchesOrder(admin, order, destination))) {
    return { ok: false, code: 'destination_mismatch' };
  }

  const chargeId =
    typeof intent.latest_charge === 'string'
      ? intent.latest_charge
      : intent.latest_charge?.id ?? null;

  const tickets = await buildTicketMints(admin, order.id);

  const { data, error } = await admin.rpc('ticketing_fulfill_order', {
    p_order: order.id,
    p_payment_intent: paymentIntentId,
    p_charge: chargeId,
    p_amount: intent.amount,
    p_currency: intent.currency,
    p_tickets: tickets,
  });
  if (error) throw new Error(`ticketing_fulfill_order failed: ${error.message}`);

  const result = data as { ok: boolean; code?: string };
  if (!result.ok) return { ok: false, code: result.code ?? 'fulfillment_rejected' };
  return { ok: true };
}

export function verifyIntentAgainstOrder(
  intent: Pick<Stripe.PaymentIntent, 'status' | 'amount' | 'currency' | 'transfer_data' | 'application_fee_amount' | 'metadata'>,
  order: Pick<OrderRow, 'id' | 'total_amount' | 'currency' | 'platform_fee_amount'>,
): string | null {
  if (intent.status !== 'succeeded') return 'intent_not_succeeded';
  if (intent.metadata?.click_order_id && intent.metadata.click_order_id !== order.id) {
    return 'order_reference_mismatch';
  }
  if (intent.amount !== order.total_amount) return 'amount_mismatch';
  if (intent.currency.toLowerCase() !== order.currency.toLowerCase()) return 'currency_mismatch';
  if ((intent.application_fee_amount ?? 0) !== order.platform_fee_amount) {
    return 'application_fee_mismatch';
  }
  return null;
}

type MintPayload = {
  tier_id: string;
  ordinal: number;
  ticket_number: string;
  token_hash: string;
};

async function buildTicketMints(admin: SupabaseClient, orderId: string): Promise<MintPayload[]> {
  const { data, error } = await admin
    .from('ticket_order_items')
    .select('ticket_tier_id, quantity')
    .eq('order_id', orderId);
  if (error) throw new Error(`ticket_order_items load failed: ${error.message}`);

  const mints: MintPayload[] = [];
  let ordinal = 1;
  for (const item of (data as { ticket_tier_id: string; quantity: number }[]) ?? []) {
    for (let i = 0; i < item.quantity; i++) {
      mints.push({
        tier_id: item.ticket_tier_id,
        ordinal: ordinal++,
        ticket_number: mintTicketNumber(),
        token_hash: mintTicketCredential().tokenHash,
      });
    }
  }
  return mints;
}

/** Verify the organizer destination on the charge matches the order's account. */
export async function destinationMatchesOrder(
  admin: SupabaseClient,
  order: OrderRow,
  destinationAccountId: string | null,
): Promise<boolean> {
  if (!destinationAccountId) return false;
  const { data, error } = await admin
    .from('organizer_payment_accounts')
    .select('stripe_account_id')
    .eq('id', order.organizer_payment_account_id)
    .single();
  if (error) return false;
  return (data as { stripe_account_id: string }).stripe_account_id === destinationAccountId;
}
