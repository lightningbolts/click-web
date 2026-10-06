import { NextRequest, NextResponse } from 'next/server';
import { apiError } from '@/lib/api/errors';
import { getStripe } from '@/lib/server/stripe';
import { billingReturnUrl, loadPlaceStripeIds } from '@/lib/server/places/billing';
import { requirePlaceManagerContext } from '@/lib/server/places/routeContext';

/** POST /api/places/[placeId]/billing/portal — owner opens Stripe's billing portal for this Place. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ placeId: string }> }) {
  try {
    const { placeId } = await params;
    const ctx = await requirePlaceManagerContext(request, placeId, { roles: ['owner'] });
    if (!ctx.ok) return ctx.response;
    if (!process.env.STRIPE_SECRET_KEY) return apiError('Billing isn’t available right now', 503, 'billing_unavailable');
    const { customerId } = await loadPlaceStripeIds(ctx.admin, ctx.place.id);
    if (!customerId) return apiError('This Place has no billing account yet', 409, 'no_customer');
    const session = await getStripe().billingPortal.sessions.create({ customer: customerId, return_url: billingReturnUrl(ctx.place.id) });
    return NextResponse.json({ url: session.url });
  } catch (e) {
    console.error('POST /api/places/[placeId]/billing/portal:', e instanceof Error ? e.message : e);
    return apiError('Couldn’t open billing', 500, 'portal_failed');
  }
}
