/**
 * @jest-environment node
 */
import type Stripe from 'stripe';
import type { SupabaseClient } from '@supabase/supabase-js';
import { FakeDb } from '@/__tests__/helpers/fakeSupabase';

jest.mock('server-only', () => ({}));
jest.mock('@/lib/server/stripe', () => ({
  getStripe: () => {
    throw new Error('Stripe must not be called for an order already fulfilled');
  },
}));

import { fulfillFromCheckoutSession } from '@/lib/server/ticketing/fulfillment';

const ORDER = '22222222-2222-4222-8222-222222222222';

describe('fulfillFromCheckoutSession on a redelivered webhook', () => {
  it.each(['paid', 'partially_refunded', 'refunded', 'disputed'])(
    'treats a fulfilled order that is now %s as done (never refunds the rest)',
    async (orderState) => {
      const db = new FakeDb({
        tables: {
          ticket_orders: [
            { id: ORDER, order_state: orderState, fulfillment_state: 'fulfilled', stripe_checkout_session_id: 'cs_1' },
          ],
        },
      });
      const session = { id: 'cs_1', metadata: { click_order_id: ORDER }, payment_status: 'paid' } as unknown as Stripe.Checkout.Session;
      await expect(fulfillFromCheckoutSession(db.client as unknown as SupabaseClient, session)).resolves.toEqual({ ok: true, code: 'idempotent' });
      expect(db.log.filter((entry) => entry.table.startsWith('rpc:'))).toHaveLength(0);
    },
  );
});
