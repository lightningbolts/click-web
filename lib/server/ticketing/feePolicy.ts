import 'server-only';

/**
 * Platform fee policy for ticket sales.
 *
 * Every order stores a snapshot of the policy used to price it
 * (`ticket_orders.fee_policy_snapshot`) so later pricing changes never
 * rewrite historical financial records. All amounts are integer cents.
 */

export type FeePolicy = {
  version: number;
  /** Basis points of the ticket subtotal (500 = 5%). */
  percent_bps: number;
  /** Flat fee in cents added once per paid order. */
  flat_cents: number;
};

export const CURRENT_FEE_POLICY: FeePolicy = {
  version: 1,
  percent_bps: 500,
  flat_cents: 0,
};

export function isFeePolicy(v: unknown): v is FeePolicy {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return false;
  const r = v as Record<string, unknown>;
  return (
    Number.isInteger(r.version) &&
    Number.isInteger(r.percent_bps) &&
    Number.isInteger(r.flat_cents) &&
    (r.percent_bps as number) >= 0 &&
    (r.percent_bps as number) <= 10000 &&
    (r.flat_cents as number) >= 0
  );
}

/**
 * Platform fee in cents for a subtotal, rounded half-up, never exceeding the
 * subtotal (Stripe rejects application fees larger than the charge) and never
 * applied to a free order.
 */
export function computePlatformFeeCents(subtotalCents: number, policy: FeePolicy): number {
  if (!Number.isInteger(subtotalCents) || subtotalCents < 0) {
    throw new Error(`Invalid subtotal: ${subtotalCents}`);
  }
  if (subtotalCents === 0) return 0;
  const percentFee = Math.floor((subtotalCents * policy.percent_bps + 5000) / 10000);
  return Math.min(subtotalCents, percentFee + policy.flat_cents);
}

export type OrderPricing = {
  subtotalCents: number;
  platformFeeCents: number;
  totalCents: number;
  feePolicySnapshot: FeePolicy;
};

export type PricedItem = { unitAmountCents: number; quantity: number };

/**
 * Price an order from server-loaded tier amounts. The attendee pays the ticket
 * face value; Click's fee is deducted from the organizer transfer
 * (application_fee_amount), so total == subtotal for v1.
 */
export function priceOrder(items: readonly PricedItem[], policy: FeePolicy): OrderPricing {
  let subtotal = 0;
  for (const item of items) {
    if (
      !Number.isInteger(item.unitAmountCents) ||
      item.unitAmountCents < 0 ||
      !Number.isInteger(item.quantity) ||
      item.quantity <= 0
    ) {
      throw new Error('Invalid order item pricing');
    }
    subtotal += item.unitAmountCents * item.quantity;
  }
  return {
    subtotalCents: subtotal,
    platformFeeCents: computePlatformFeeCents(subtotal, policy),
    totalCents: subtotal,
    feePolicySnapshot: policy,
  };
}
