import 'server-only';

import type Stripe from 'stripe';
import { mayViewTicketing } from './access';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getStripe, getAppBaseUrl } from '@/lib/server/stripe';
import { CURRENT_FEE_POLICY, priceOrder } from '@/lib/server/ticketing/feePolicy';

const HOLD_MINUTES = 32; // small reconciliation window past session expiry

export type CheckoutItemInput = { tierId: string; quantity: number };

export type CheckoutResult =
  | { ok: true; orderId: string; checkoutUrl: string }
  | { ok: false; status: number; code: string; extra?: Record<string, unknown> };

type TierRow = {
  id: string;
  beacon_id: string;
  name: string;
  currency: string;
  unit_amount: number;
};

const RESERVE_FAILURE_STATUS: Record<string, number> = {
  invalid_items: 400,
  event_not_found: 404,
  tier_not_found: 404,
  sales_not_open: 409,
  sales_not_started: 409,
  sales_ended: 409,
  organizer_not_ready: 409,
  tier_inactive: 409,
  currency_mismatch: 409,
  price_changed: 409,
  over_order_limit: 409,
  over_user_limit: 409,
  insufficient_inventory: 409,
  pricing_mismatch: 500,
};

/**
 * Reserve inventory in Postgres first, then create the Stripe Checkout
 * Session. The client submitted only tier ids + quantities; every financial
 * value is loaded and computed here. If Stripe session creation fails the
 * reservation stays held until reconciled; the Stripe call itself is idempotent on the order
 * id so a lost HTTP response can be retried without a second checkout.
 */
export async function createTicketCheckout(
  admin: SupabaseClient,
  buyerUserId: string,
  beaconId: string,
  items: readonly CheckoutItemInput[],
  attemptId: string,
): Promise<CheckoutResult> {
  if (!(await mayViewTicketing(admin, beaconId, buyerUserId)))
    return { ok: false, status: 403, code: 'invitation_required' };
  const tierIds = items.map((i) => i.tierId);
  const { data: tierRows, error: tierError } = await admin
    .from('ticket_tiers')
    .select('id, beacon_id, name, currency, unit_amount')
    .in('id', tierIds);
  if (tierError) throw new Error(`ticket_tiers load failed: ${tierError.message}`);

  const tiers = new Map((tierRows as TierRow[]).map((t) => [t.id, t]));
  for (const item of items) {
    const tier = tiers.get(item.tierId);
    if (!tier || tier.beacon_id !== beaconId) {
      return { ok: false, status: 404, code: 'tier_not_found' };
    }
  }

  const currency = (tiers.get(items[0]!.tierId)!.currency || 'usd').toLowerCase();
  const pricing = priceOrder(
    items.map((i) => ({
      unitAmountCents: tiers.get(i.tierId)!.unit_amount,
      quantity: i.quantity,
    })),
    CURRENT_FEE_POLICY,
  );

  const { data: reserveRaw, error: reserveError } = await admin.rpc('ticketing_reserve_order', {
    p_buyer: buyerUserId,
    p_attempt: attemptId,
    p_beacon: beaconId,
    p_items: items.map((i) => ({
      tier_id: i.tierId,
      quantity: i.quantity,
      expected_unit_amount: tiers.get(i.tierId)!.unit_amount,
    })),
    p_currency: currency,
    p_subtotal: pricing.subtotalCents,
    p_platform_fee: pricing.platformFeeCents,
    p_total: pricing.totalCents,
    p_fee_policy: pricing.feePolicySnapshot,
    p_hold_minutes: HOLD_MINUTES,
  });
  if (reserveError) throw new Error(`ticketing_reserve_order failed: ${reserveError.message}`);

  const reserve = reserveRaw as {
    ok: boolean;
    code?: string;
    order_id?: string;
    remaining?: number;
  };
  if (!reserve.ok || !reserve.order_id) {
    const code = reserve.code ?? 'reservation_failed';
    return {
      ok: false,
      status: RESERVE_FAILURE_STATUS[code] ?? 409,
      code,
      extra: reserve.remaining !== undefined ? { remaining: reserve.remaining } : undefined,
    };
  }
  const orderId = reserve.order_id;

  const { data: order, error: orderError } = await admin
    .from('ticket_orders')
    .select('*')
    .eq('id', orderId)
    .single();
  if (orderError) throw new Error(orderError.message);
  const stripe = getStripe();
  if (order.stripe_checkout_session_id) {
    const session = await stripe.checkout.sessions.retrieve(order.stripe_checkout_session_id);
    if (session.status === 'open' && session.url)
      return { ok: true, orderId, checkoutUrl: session.url };
    return { ok: false, status: 409, code: 'checkout_finished', extra: { order_id: orderId } };
  }
  if (order.order_state !== 'reserved')
    return { ok: false, status: 409, code: 'checkout_finished', extra: { order_id: orderId } };
  // Never recreate an uncertain request after Stripe's 24-hour idempotency retention.
  if (Date.now() - Date.parse(order.created_at) > 23 * 60 * 60 * 1000)
    return { ok: false, status: 409, code: 'checkout_needs_attention' };
  const { data: snapshots, error: snapshotError } = await admin
    .from('ticket_order_items')
    .select('quantity,unit_amount,tier_name_snapshot')
    .eq('order_id', orderId)
    .order('ticket_tier_id');
  if (snapshotError) throw new Error(snapshotError.message);
  const organizer = await loadOrganizerStripeAccountForBeacon(admin, beaconId);
  const base = getAppBaseUrl();
  const proposed: Stripe.Checkout.SessionCreateParams = {
    mode: 'payment',
    payment_method_types: ['card'],
    client_reference_id: orderId,
    metadata: { click_order_id: orderId, click_event_id: beaconId },
    line_items: (snapshots ?? []).map((i) => ({
      quantity: i.quantity,
      price_data: {
        currency: order.currency,
        unit_amount: i.unit_amount,
        product_data: { name: i.tier_name_snapshot },
      },
    })),
    expires_at: Math.floor(Date.parse(order.checkout_expires_at) / 1000),
    payment_intent_data: {
      transfer_data: { destination: organizer.stripeAccountId },
      application_fee_amount: order.platform_fee_amount,
      metadata: { click_order_id: orderId },
    },
    success_url: base + '/e/' + beaconId + '/tickets/return?order=' + orderId,
    cancel_url: base + '/e/' + beaconId + '/tickets/return?order=' + orderId + '&canceled=1',
  };
  // Freeze all Stripe parameters before the network request; concurrent callers read the winner.
  if (!order.checkout_request) {
    const { error } = await admin
      .from('ticket_orders')
      .update({ checkout_request: proposed })
      .eq('id', orderId)
      .is('checkout_request', null);
    if (error) throw new Error(error.message);
  }
  const { data: frozen, error: frozenError } = await admin
    .from('ticket_orders')
    .select('checkout_request')
    .eq('id', orderId)
    .single();
  if (frozenError || !frozen?.checkout_request)
    throw new Error('Could not persist checkout request');
  // Ambiguous failures keep inventory reserved until Stripe reconciliation proves nonpayment.
  const session = await stripe.checkout.sessions.create(
    frozen.checkout_request as Stripe.Checkout.SessionCreateParams,
    { idempotencyKey: 'checkout-order:' + orderId },
  );
  const { error } = await admin
    .from('ticket_orders')
    .update({ stripe_checkout_session_id: session.id, order_state: 'checkout_created' })
    .eq('id', orderId)
    .eq('order_state', 'reserved');
  if (error) throw new Error(error.message);
  if (!session.url)
    return { ok: false, status: 409, code: 'checkout_finished', extra: { order_id: orderId } };
  return { ok: true, orderId, checkoutUrl: session.url };
}

async function loadOrganizerStripeAccountForBeacon(
  admin: SupabaseClient,
  beaconId: string,
): Promise<{ stripeAccountId: string }> {
  const { data, error } = await admin
    .from('map_beacons')
    .select('organizer_payment_account_id, organizer_payment_accounts ( stripe_account_id )')
    .eq('id', beaconId)
    .single();
  if (error) throw new Error(`beacon organizer load failed: ${error.message}`);
  const joined = (data as { organizer_payment_accounts?: { stripe_account_id?: string } | null })
    .organizer_payment_accounts;
  const stripeAccountId = joined?.stripe_account_id;
  if (!stripeAccountId) throw new Error('beacon has no organizer Stripe account');
  return { stripeAccountId };
}
