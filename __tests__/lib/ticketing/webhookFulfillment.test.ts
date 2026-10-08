/**
 * @jest-environment node
 */
jest.mock('server-only', () => ({}));

const mockFulfill = jest.fn();
const mockRevalidate = jest.fn();

jest.mock('@/lib/server/ticketing/fulfillment', () => ({
  fulfillFromCheckoutSession: (...args: unknown[]) => mockFulfill(...args),
  loadOrder: jest.fn(),
}));
jest.mock('@/lib/server/events/revalidatePublicEvents', () => ({
  revalidatePublicEvents: (...args: unknown[]) => mockRevalidate(...args),
}));

import type Stripe from 'stripe';
import { handleTicketingEvent } from '@/lib/server/ticketing/webhookHandlers';

const EVENT = '11111111-1111-4111-8111-111111111111';
const completed = {
  type: 'checkout.session.completed',
  data: { object: { id: 'cs_1', metadata: { click_order_id: 'o1', click_event_id: EVENT } } },
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
});
