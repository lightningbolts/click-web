import { headers } from 'next/headers';
import Stripe from 'stripe';
import { NextResponse } from 'next/server';
import { getStripe } from '@/lib/server/stripe';
import { createSupabaseServiceRoleClient } from '@/lib/server/supabaseServer';
import { stripeSubscriptionStatusToVenue } from '@/lib/server/stripeVenueStatus';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
  const stripe = getStripe();
  const venueId = session.metadata?.venue_id ?? session.client_reference_id ?? undefined;
  const supabaseUserId = session.metadata?.supabase_user_id;

  if (!venueId || !supabaseUserId) {
    console.error('Stripe webhook: checkout.session.completed missing venue_id or supabase_user_id');
    return;
  }

  let subscriptionId: string | null =
    typeof session.subscription === 'string'
      ? session.subscription
      : session.subscription?.id ?? null;
  let customerId: string | null =
    typeof session.customer === 'string' ? session.customer : session.customer?.id ?? null;

  if (!subscriptionId || !customerId) {
    const full = await stripe.checkout.sessions.retrieve(session.id, {
      expand: ['subscription', 'customer'],
    });
    subscriptionId =
      typeof full.subscription === 'string'
        ? full.subscription
        : full.subscription && typeof full.subscription !== 'string'
          ? full.subscription.id
          : null;
    customerId =
      typeof full.customer === 'string'
        ? full.customer
        : full.customer && typeof full.customer !== 'string'
          ? full.customer.id
          : null;
  }

  if (!subscriptionId || !customerId) {
    console.error('Stripe webhook: could not resolve subscription/customer for session', session.id);
    return;
  }

  const sub = await stripe.subscriptions.retrieve(subscriptionId);
  const status = stripeSubscriptionStatusToVenue(sub.status);

  const admin = createSupabaseServiceRoleClient();

  const { error: venueError } = await admin
    .from('venues')
    .update({
      stripe_customer_id: customerId,
      stripe_subscription_id: subscriptionId,
      subscription_status: status,
    })
    .eq('id', venueId);

  if (venueError) {
    console.error('Stripe webhook: venue update failed', venueError);
    return;
  }

  const { error: insertError } = await admin.from('venue_managers').insert({
    user_id: supabaseUserId,
    venue_id: venueId,
    role: 'owner',
  });

  if (insertError && insertError.code !== '23505') {
    console.error('Stripe webhook: venue_managers insert failed', insertError);
  }
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const admin = createSupabaseServiceRoleClient();
  const status = stripeSubscriptionStatusToVenue(subscription.status);
  const venueIdFromMeta = subscription.metadata?.venue_id;

  if (venueIdFromMeta) {
    const { error } = await admin
      .from('venues')
      .update({ subscription_status: status })
      .eq('id', venueIdFromMeta);
    if (error) {
      console.error('Stripe webhook: subscription venue update by metadata failed', error);
    }
    return;
  }

  const { error } = await admin
    .from('venues')
    .update({ subscription_status: status })
    .eq('stripe_subscription_id', subscription.id);

  if (error) {
    console.error('Stripe webhook: subscription venue update by stripe_subscription_id failed', error);
  }
}

/**
 * Idempotency guard: Stripe retries deliveries, and replays must not repeat
 * side effects (venue updates, manager inserts). Returns true when this event
 * id has already been recorded.
 */
async function eventAlreadyProcessed(eventId: string): Promise<boolean> {
  const admin = createSupabaseServiceRoleClient();
  const { error } = await admin.from('stripe_webhook_events').insert({ id: eventId });
  if (!error) return false;
  if (error.code === '23505') return true; // duplicate delivery
  // Table missing or transient failure — log and process anyway rather than
  // dropping a billing event.
  console.error('Stripe webhook: idempotency insert failed', error.message);
  return false;
}

export async function POST(request: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('STRIPE_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
  }

  const body = await request.text();
  const headerList = await headers();
  const sig = headerList.get('stripe-signature');
  if (!sig) {
    return NextResponse.json({ error: 'Missing stripe-signature' }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid signature';
    console.error('Stripe webhook signature error:', message);
    return NextResponse.json({ error: `Webhook Error: ${message}` }, { status: 400 });
  }

  if (await eventAlreadyProcessed(event.id)) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      case 'customer.subscription.updated':
      // Deleted subscriptions arrive with status 'canceled'; the shared handler
      // maps that onto venues.subscription_status and revokes insights gating.
      case 'customer.subscription.deleted':
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;
      default:
        break;
    }
  } catch (e) {
    console.error('Stripe webhook handler error:', e);
    return NextResponse.json({ error: 'Handler failed' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
