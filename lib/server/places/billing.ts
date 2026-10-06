import 'server-only';

import type Stripe from 'stripe';
import type { SupabaseClient } from '@supabase/supabase-js';
import { publicOrigin } from '@/lib/events/eventUrls';

/** Where Stripe sends the owner back: always the same Place's Billing tab (spec §9.5). */
export function billingReturnUrl(placeId: string, checkout?: 'success' | 'canceled'): string {
  return `${publicOrigin()}/business/places/${placeId}/billing${checkout ? `?checkout=${checkout}` : ''}`;
}

export async function loadPlaceStripeIds(
  admin: SupabaseClient,
  placeId: string,
): Promise<{ customerId: string | null; subscriptionId: string | null }> {
  const { data, error } = await admin.from('places').select('stripe_customer_id, stripe_subscription_id').eq('id', placeId).maybeSingle();
  if (error) throw new Error(`place billing: ${error.message}`);
  const row = (data as { stripe_customer_id?: string | null; stripe_subscription_id?: string | null } | null) ?? {};
  return { customerId: row.stripe_customer_id ?? null, subscriptionId: row.stripe_subscription_id ?? null };
}

/**
 * Checkout for one existing Place (spec §9.5): metadata on the session and the subscription carry
 * the Place id, so the webhook updates this row. Reuses the Stripe customer when there is one.
 * It never creates a Place.
 */
export function placeCheckoutParams(args: {
  placeId: string;
  userId: string;
  email: string | null;
  customerId: string | null;
  priceId: string;
}): Stripe.Checkout.SessionCreateParams {
  const metadata = { venue_id: args.placeId, supabase_user_id: args.userId };
  return {
    mode: 'subscription',
    line_items: [{ price: args.priceId, quantity: 1 }],
    ...(args.customerId ? { customer: args.customerId } : args.email ? { customer_email: args.email } : {}),
    client_reference_id: args.placeId,
    metadata,
    subscription_data: { metadata },
    success_url: billingReturnUrl(args.placeId, 'success'),
    cancel_url: billingReturnUrl(args.placeId, 'canceled'),
  };
}
