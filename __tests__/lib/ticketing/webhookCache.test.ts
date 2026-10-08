/**
 * @jest-environment node
 */
import type Stripe from 'stripe';
import type { SupabaseClient } from '@supabase/supabase-js';
import { FakeDb } from '@/__tests__/helpers/fakeSupabase';

jest.mock('server-only', () => ({}));

const mockFulfill = jest.fn();
const mockRevalidate = jest.fn();
const mockStripeRefund = jest.fn();

jest.mock('@/lib/server/ticketing/fulfillment', () => ({
  ...jest.requireActual('@/lib/server/ticketing/fulfillment'),
  fulfillFromCheckoutSession: (...args: unknown[]) => mockFulfill(...args),
}));
jest.mock('@/lib/server/events/revalidatePublicEvents', () => ({
  revalidatePublicEvents: (...args: unknown[]) => mockRevalidate(...args),
}));
jest.mock('@/lib/server/stripe', () => ({
  getStripe: () => ({ refunds: { create: (...args: unknown[]) => mockStripeRefund(...args) } }),
}));

import { handleTicketingEvent } from '@/lib/server/ticketing/webhookHandlers';

const EVENT = '11111111-1111-4111-8111-111111111111';
const ORDER = '22222222-2222-4222-8222-222222222222';

function world(orderState: string) {
  return new FakeDb({
    tables: { ticket_orders: [{ id: ORDER, beacon_id: EVENT, order_state: orderState, fulfillment_state: 'unfulfilled' }] },
    rpc: {
      ticketing_cancel_order: () => ({ ok: true, order_state: 'expired' }),
      ticketing_apply_refund: () => ({ ok: true }),
    },
  });
}
const admin = (db: FakeDb) => db.client as unknown as SupabaseClient;
const sessionEvent = (type: string) =>
  ({
    type,
    data: { object: { id: 'cs_1', payment_status: 'paid', payment_intent: 'pi_1', metadata: { click_order_id: ORDER, click_event_id: EVENT } } },
  }) as unknown as Stripe.Event;

beforeEach(() => jest.clearAllMocks());

describe('webhooks keep the event page and the order honest', () => {
  it('an expired checkout frees tickets on the event page', async () => {
    await handleTicketingEvent(admin(world('checkout_created')), sessionEvent('checkout.session.expired'));
    expect(mockRevalidate).toHaveBeenCalledWith(EVENT);
  });

  it('a refund update refreshes the event page', async () => {
    const event = {
      type: 'refund.updated',
      data: { object: { id: 're_1', amount: 1500, status: 'succeeded', metadata: { click_order_id: ORDER, click_ticket_ids: 't1' } } },
    } as unknown as Stripe.Event;
    await handleTicketingEvent(admin(world('paid')), event);
    expect(mockRevalidate).toHaveBeenCalledWith(EVENT);
  });

  it('a late payment that was given back marks the order refunded (the return page says so)', async () => {
    mockFulfill.mockResolvedValue({ ok: false, code: 'order_not_payable' });
    const db = world('canceled');
    await handleTicketingEvent(admin(db), sessionEvent('checkout.session.completed'));
    expect(mockStripeRefund).toHaveBeenCalled();
    expect(db.rows('ticket_orders')[0]).toMatchObject({ order_state: 'refunded' });
  });
});
