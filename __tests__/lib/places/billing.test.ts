/**
 * @jest-environment node
 */
jest.mock('server-only', () => ({}));

import { placeCheckoutParams } from '@/lib/server/places/billing';

describe('per-Place checkout (spec §9.5 Billing)', () => {
  const args = { placeId: 'place-1', userId: 'u1', email: 'o@x.co', priceId: 'price_1' };

  it('tags the session and the subscription with the Place, and returns to its Billing tab', () => {
    const p = placeCheckoutParams({ ...args, customerId: null });
    expect(p.metadata).toEqual({ venue_id: 'place-1', supabase_user_id: 'u1' });
    expect(p.subscription_data?.metadata).toEqual({ venue_id: 'place-1', supabase_user_id: 'u1' });
    expect(p.client_reference_id).toBe('place-1');
    expect(p.success_url).toMatch(/\/business\/places\/place-1\/billing\?checkout=success$/);
    expect(p.cancel_url).toMatch(/\/business\/places\/place-1\/billing\?checkout=canceled$/);
    expect(p.customer_email).toBe('o@x.co');
  });

  it('reuses the Stripe customer when the Place has one', () => {
    const p = placeCheckoutParams({ ...args, customerId: 'cus_9' });
    expect(p.customer).toBe('cus_9');
    expect(p.customer_email).toBeUndefined();
  });
});
