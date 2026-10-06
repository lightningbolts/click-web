import { NextRequest, NextResponse } from 'next/server';
import { apiError } from '@/lib/api/errors';
import { getStripe } from '@/lib/server/stripe';
import { loadPlaceStripeIds, placeCheckoutParams } from '@/lib/server/places/billing';
import { placeHasInsights } from '@/lib/server/places/entitlement';
import { requirePlaceManagerContext } from '@/lib/server/places/routeContext';

/**
 * POST /api/places/[placeId]/billing/checkout — owner starts Click for Business for this Place.
 * `{ url }` of a Stripe Checkout session; 409 when the Place is already on the plan.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ placeId: string }> }) {
  try {
    const { placeId } = await params;
    const ctx = await requirePlaceManagerContext(request, placeId, { roles: ['owner'] });
    if (!ctx.ok) return ctx.response;
    const { admin, place, user } = ctx;
    if (placeHasInsights(place)) return apiError('This Place is already on Click for Business', 409, 'already_subscribed');

    const priceId = process.env.STRIPE_PRICE_ID;
    if (!priceId || !process.env.STRIPE_SECRET_KEY) return apiError('Upgrades aren’t available right now', 503, 'billing_unavailable');

    const { customerId } = await loadPlaceStripeIds(admin, place.id);
    const session = await getStripe().checkout.sessions.create(
      placeCheckoutParams({ placeId: place.id, userId: user.id, email: user.email ?? null, customerId, priceId }),
    );
    if (!session.url) return apiError('Couldn’t start checkout', 502, 'checkout_failed');
    return NextResponse.json({ url: session.url });
  } catch (e) {
    console.error('POST /api/places/[placeId]/billing/checkout:', e instanceof Error ? e.message : e);
    return apiError('Couldn’t start checkout', 500, 'checkout_failed');
  }
}
