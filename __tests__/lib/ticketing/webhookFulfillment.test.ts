/**
 * @jest-environment node
 */
jest.mock('server-only', () => ({}));

const mockFulfill = jest.fn();
const mockRevalidate = jest.fn();
const mockStripeRefund = jest.fn();

jest.mock('@/lib/server/ticketing/fulfillment', () => ({
  fulfillFromCheckoutSession: (...args: unknown[]) => mockFulfill(...args),
  loadOrder: jest.fn(),
}));
jest.mock('@/lib/server/events/revalidatePublicEvents', () => ({
  revalidatePublicEvents: (...args: unknown[]) => mockRevalidate(...args),
}));

jest.mock('@/lib/server/stripe', () => ({
  getStripe: () => ({ refunds: { create: (...args: unknown[]) => mockStripeRefund(...args) } }),
}));

import type Stripe from 'stripe';
import { handleTicketingEvent } from '@/lib/server/ticketing/webhookHandlers';

const EVENT = '11111111-1111-4111-8111-111111111111';
const completed = {
  type: 'checkout.session.completed',
  data: { object: { id: 'cs_1', payment_status: 'paid', payment_intent: 'pi_1', metadata: { click_order_id: 'o1', click_event_id: EVENT } } },
} as unknown as Stripe.Event;

beforeEach(() => jest.clearAllMocks());

describe('checkout fulfillment webhook', () => {
  it('refreshes the event page once tickets exist', async () => {
    mockFulfill.mockResolvedValue({ ok: true });
    await handleTicketingEvent({} as never, completed);
    expect(mockRevalidate).toHaveBeenCalledWith(EVENT);
  });

  it('leaves the cache alone when nothing was fulfilled', async () => {
    mockFulfill.mockResolvedValue({ ok: false, code: 'not_paid_yet' });
    await handleTicketingEvent({} as never, completed);
    expect(mockRevalidate).not.toHaveBeenCalled();
  });

  it('refunds a payment that lands after the order was cancelled', async () => {
    mockFulfill.mockResolvedValue({ ok: false, code: 'order_not_payable' });
    await handleTicketingEvent({} as never, completed);
    expect(mockStripeRefund).toHaveBeenCalledWith(
      expect.objectContaining({ payment_intent: 'pi_1', reverse_transfer: true, refund_application_fee: true }),
      { idempotencyKey: 'unfulfillable-payment:cs_1' },
    );
  });

  it('does not refund for other fulfillment problems', async () => {
    mockFulfill.mockResolvedValue({ ok: false, code: 'amount_mismatch' });
    await handleTicketingEvent({} as never, completed);
    expect(mockStripeRefund).not.toHaveBeenCalled();
  });
});
