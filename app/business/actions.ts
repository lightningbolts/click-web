'use server';

import { createClient } from '@supabase/supabase-js';
import { getAppBaseUrl, getStripe } from '@/lib/server/stripe';

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const MAX_NAME = 200;
const MAX_LOCATION = 500;

function createSupabaseWithAccessToken(accessToken: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}

/**
 * Creates a venue in `inactive` state and adds the current user as owner (RLS).
 * Pass the browser session `access_token` so the server can authorize the user (implicit flow uses localStorage, not cookies).
 */
export async function createVenueForCheckout(
  accessToken: string,
  name: string,
  location: string,
): Promise<ActionResult<{ venueId: string }>> {
  const trimmedName = name.trim();
  const trimmedLocation = location.trim();
  if (!trimmedName) {
    return { ok: false, error: 'Venue name is required.' };
  }
  if (trimmedName.length > MAX_NAME || trimmedLocation.length > MAX_LOCATION) {
    return { ok: false, error: 'Venue details are too long.' };
  }

  const supabase = createSupabaseWithAccessToken(accessToken);
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(accessToken);

  if (authError || !user) {
    return { ok: false, error: 'You must be signed in to continue.' };
  }

  const { data: venue, error: venueError } = await supabase
    .from('venues')
    .insert({
      name: trimmedName,
      location: trimmedLocation || null,
      subscription_status: 'inactive',
    })
    .select('id')
    .single();

  if (venueError || !venue) {
    return { ok: false, error: venueError?.message ?? 'Could not create venue.' };
  }

  const { error: managerError } = await supabase.from('venue_managers').insert({
    user_id: user.id,
    venue_id: venue.id,
    role: 'owner',
  });

  if (managerError) {
    return { ok: false, error: managerError.message };
  }

  return { ok: true, data: { venueId: venue.id } };
}

/**
 * Creates a Stripe Checkout Session (subscription) for the given venue.
 */
export async function createStripeCheckoutSession(
  accessToken: string,
  venueId: string,
): Promise<ActionResult<{ url: string }>> {
  const priceId = process.env.STRIPE_PRICE_ID;
  if (!priceId) {
    return { ok: false, error: 'Stripe price is not configured (STRIPE_PRICE_ID).' };
  }

  const supabase = createSupabaseWithAccessToken(accessToken);
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(accessToken);

  if (authError || !user) {
    return { ok: false, error: 'You must be signed in to continue.' };
  }

  const { data: membership, error: vmError } = await supabase
    .from('venue_managers')
    .select('id, role')
    .eq('venue_id', venueId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (vmError || !membership || !['owner', 'manager'].includes(membership.role)) {
    return { ok: false, error: 'You do not have permission to subscribe for this venue.' };
  }

  const base = getAppBaseUrl();
  let stripe: ReturnType<typeof getStripe>;
  try {
    stripe = getStripe();
  } catch {
    return { ok: false, error: 'Stripe is not configured (STRIPE_SECRET_KEY).' };
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer_email: user.email ?? undefined,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${base}/business/signup?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}/business/signup?checkout=canceled`,
    client_reference_id: venueId,
    metadata: {
      venue_id: venueId,
      supabase_user_id: user.id,
    },
    subscription_data: {
      metadata: {
        venue_id: venueId,
        supabase_user_id: user.id,
      },
    },
  });

  if (!session.url) {
    return { ok: false, error: 'Stripe did not return a checkout URL.' };
  }

  return { ok: true, data: { url: session.url } };
}
